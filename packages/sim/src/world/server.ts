// SPDX-License-Identifier: GPL-2.0-or-later
// Lógica de servidor do frame (`ServerWorld`, src/world.cpp:1228-3365): tiro e foguetes (OG-022),
// colisões especiais entre jogadores (OG-023), vida, energia, dano e morte (OG-024), power-ups
// (OG-025), deathbringer (OG-026), bandeiras (OG-027) e ciclo da partida (OG-029). O que fica fora
// da sim (troca de mapa, votação, placar final) é avisado pelos `ServerHooks`.
import type { GameSettings } from '@outgun/settings';
import { FLAG_RADIUS, MAX_PLAYERS, MAX_POWERUPS, PLAYER_RADIUS, POWERUP_RADIUS, ROOM_HEIGHT, ROOM_WIDTH } from '../constants.js';
import { Vec } from '../geometry/vec.js';
import { iround, iroundBound, sqr } from '../math.js';
import { randomShuffle, type Rng } from '../rng.js';
import { isRun } from './controls.js';
import { shootRocketFormation } from './rockets.js';
import type { SampleName } from './samples.js';
import type { GameMap, WorldCoords, WorldRect } from '../map/map.js';
import { finishMatch, type MatchResult } from './stats.js';
import { applyPhysics, executePlayerBounce, type PhysicsCallbacks, type PhysicsContext, type PlayerHitResult } from './physics.js';
import { CarriedFlag, DeathbringerExplosion, FlagState, newStats, PlayerState, Position, PowerupKind, type GameOverReason, type PlayerStats, type PowerupState, type RocketState, type WorldState } from './state.js';

/** Alpha do jogador com shadow quando é revelado (atirou, foi atingido...). */
export const MAXIMUM_SHADOW_VISIBILITY = 254;

export const DamageType = { rocket: 0, deathbringer: 1, collision: 2 } as const;
export type DamageType = (typeof DamageType)[keyof typeof DamageType];

/** Efeitos de pontuação para fora da sim (ranking, OG-084) e eventos para a rede/áudio. */
export interface ServerHooks {
  /** Frag positivo ou negativo (`Server::score_frag`); a sim já soma em `stats.frags`. */
  scoreFrag?(pid: number, amount: number): void;
  /** Ponto negativo do ranking (`Server::score_neg`). */
  scoreNeg?(pid: number, amount: number): void;
  /** Bandeira pega (`broadcast_flag_take`). */
  flagTaken?(pid: number, flag: CarriedFlag): void;
  /** Bandeira largada de propósito ou entregue numa captura (`broadcast_flag_drop`). */
  flagDropped?(pid: number, flag: CarriedFlag, captureDrop: boolean): void;
  /** Bandeira do próprio time devolvida (`broadcast_flag_return`). */
  flagReturned?(pid: number): void;
  /** Captura (`broadcast_capture`); `flagTeam` 2 = selvagem, `assistPid` −1 = sem assistência. */
  flagCaptured?(pid: number, flagTeam: number, assistPid: number): void;
  /** Suicídio (`broadcast_suicide`), com a bandeira que o jogador carregava. */
  suicide?(pid: number, flag: CarriedFlag): void;
  /** Morte com atacante (`broadcast_kill`): bônus de defesa entram na mensagem do original. */
  kill?(attacker: number, target: number, cause: DamageType, carriedFlag: CarriedFlag, carrierDefended: boolean, flagDefended: boolean): void;
  /** Jogador entrou em jogo (`broadcast_spawn`); não é chamado no reset do mapa. */
  playerSpawned?(pid: number): void;
  /** Aviso de tempo restante: 5 min, 1 min ou 30 s (`broadcast_5_min_left`...). */
  timeWarning?(secondsLeft: 300 | 60 | 30): void;
  /** Fim do tempo normal com empate: começa a prorrogação ou a morte súbita (`broadcast_normal_time_out`). */
  normalTimeOut?(suddenDeath: boolean): void;
  /** Novo período de prorrogação por empate (`send_map_time`). */
  extraTimePeriodStarted?(period: number): void;
  /**
   * Fim de partida (`server_next_map`): limite de capturas/morte súbita, tempo ou prorrogação.
   * Chamado no meio do frame, como no original: o servidor escolhe o próximo mapa e chama
   * `changeMap` aqui mesmo, e o resto do frame já roda no mapa reiniciado. `result` traz as
   * estatísticas finais (já fechadas com `finish_stats`) para placar, ranking e histórico.
   */
  gameOver?(reason: GameOverReason, result: MatchResult): void;
  /**
   * Tiro (`sendRocketMessage`): chamado antes de criar os foguetes, com a posição de saída (inteira,
   * como o cliente recebe). Foguetes que batem na parede ao nascer não geram outro aviso.
   */
  rocketsFired?(owner: number, rockets: readonly number[], gunDir: number, power: boolean, pos: Position): void;
  /** Foguete acertou um jogador (`blink` falso se ele tinha escudo) ou sumiu porque o dono saiu (`target` −1). */
  rocketRemoved?(rid: number, x: number, y: number, target: number, blink: boolean): void;
  /** Power-up apareceu no chão (reaparecimento ou caiu de quem morreu). */
  powerupAppeared?(index: number): void;
  /** Power-up pego, na sala `pos` (não chamado para o aliado que pega junto). */
  powerupPicked?(index: number, pos: Position): void;
  /** Jogador mudou de sala ou renasceu (`game_player_screen_change`). */
  playerScreenChange?(pid: number): void;
  /** Som para quem está na sala do jogador (`broadcast_screen_sample`). */
  screenSample?(pid: number, sample: SampleName): void;
  /** Bandeiras de um time (2 = selvagens) mudaram: pegada, largada, devolvida (`ctf_net_flag_status`). */
  flagsChanged?(team: number): void;
}

export class ServerSim {
  /** Colisões entre portadores aliados no frame (para captura com `carry_own_team_flag`). */
  readonly carrierCollisions = new Set<string>();

  constructor(
    readonly world: WorldState,
    readonly settings: GameSettings,
    public rng: Rng,
    readonly hooks: ServerHooks = {},
  ) {}

  get time(): number {
    return this.world.time;
  }

  get frame(): number {
    return this.world.frame;
  }

  physicsContext(): PhysicsContext {
    return { world: this.world, physics: this.settings.physics };
  }

  private player(pid: number): PlayerState {
    const pl = this.world.players[pid];
    if (!pl) throw new Error(`jogador ${pid} inexistente`);
    return pl;
  }

  private teamOf(pid: number): 0 | 1 {
    return this.world.teamOf(pid);
  }

  scoreFrag(pid: number, amount: number): void {
    this.player(pid).stats.frags += amount;
    this.hooks.scoreFrag?.(pid, amount);
  }

  scoreNeg(pid: number, amount: number): void {
    this.hooks.scoreNeg?.(pid, amount);
  }

  // ---------------------------------------------------------------- foguetes (OG-022)

  /** Primeiro slot livre; com a tabela cheia, sobrescreve um aleatório (`getFreeRocket`). */
  getFreeRocket(): number {
    const rockets = this.world.rockets;
    for (let i = 0; i < rockets.length; i++) {
      const rk = rockets[i] as RocketState;
      if (rk.owner === -1) {
        rk.owner = 0;
        return i;
      }
    }
    const i = this.rng.rand() % rockets.length;
    (rockets[i] as RocketState).owner = 0;
    return i;
  }

  deleteRocket(rid: number): void {
    (this.world.rockets[rid] as RocketState).owner = -1;
  }

  /** `ServerWorld::shootRockets` + `WorldBase::shootRockets`. */
  shootRockets(pl: PlayerState, shots: number): void {
    const pos = new Position(pl.pos.roomX, pl.pos.roomY, Math.trunc(pl.pos.x), Math.trunc(pl.pos.y)); // como o cliente recebe
    pl.stats.shots++;
    this.world.teams[this.teamOf(pl.pid)].shots++;
    const rids: number[] = [];
    for (let i = 0; i < shots; i++) rids.push(this.getFreeRocket());
    const team = this.teamOf(pl.pid);
    const dir = pl.attackGunDir;
    this.hooks.rocketsFired?.(pl.pid, rids, dir, pl.power, pos);
    shootRocketFormation(this.physicsContext(), rids, { owner: pl.pid, team, pos, power: pl.power, dir, frameAdvance: 0 }, this.callbacks());
  }

  // ---------------------------------------------------------------- dano e morte (OG-024)

  private lockTeamFlagsInEffect(): boolean {
    return this.settings.world.lockTeamFlags && this.allKindsOfFlagsExist();
  }

  private allKindsOfFlagsExist(): boolean {
    const w = this.world;
    return w.wildFlags.length > 0 && w.teams[0].flags.length > 0 && w.teams[1].flags.length > 0;
  }

  private sameRoom(a: Position, b: Position): boolean {
    return a.roomX === b.roomX && a.roomY === b.roomY;
  }

  /** `ServerWorld::damagePlayer` (src/world.cpp:2274). */
  damagePlayer(target: number, attacker: number, damage: number, type: DamageType): void {
    const t = this.player(target);
    if (t.dead || this.frame < t.startTakeDamageFrame) return;
    if (t.hasShadow()) t.visibility = MAXIMUM_SHADOW_VISIBILITY;
    const pups = this.settings.powerups;
    if (t.shield) {
      const sound = (sample: SampleName) => type !== DamageType.deathbringer && this.hooks.screenSample?.(target, sample);
      if (pups.pupShieldHits) {
        t.shield--;
        if (!t.shield) sound('shieldl');
      } else {
        t.energy -= damage;
        if (t.energy <= 0) {
          t.energy = 0;
          t.shield = 0;
          sound('shieldl');
        } else sound('shieldd');
      }
    } else {
      t.health -= damage;
      if (type !== DamageType.collision) t.nextShootFrame = this.frame + iround(this.settings.world.hitStunTime * 10);
    }
    if (t.health > 0) return;

    let carrierDefended = false;
    let flagDefended = false;
    const tateam = this.teamOf(target);
    const world = this.world;
    if (attacker < world.maxPlayers) {
      const a = this.player(attacker);
      const atteam = this.teamOf(attacker);
      const sameTeam = tateam === atteam;
      this.scoreFrag(attacker, sameTeam ? -2 : 1);
      if (!sameTeam) {
        // defesa de portador: um aliado do atacante carrega bandeira na sala do alvo
        for (let i = atteam * world.teamSize; i < (atteam + 1) * world.teamSize; i++) {
          const p = world.players[i];
          if (p && p.stats.carriedFlag !== CarriedFlag.None && i !== attacker && this.sameRoom(p.pos, t.pos)) {
            carrierDefended = true;
            this.scoreFrag(attacker, 1);
            break;
          }
        }
        if (!this.lockTeamFlagsInEffect()) {
          const onGroundHere = (f: FlagState) => f.status !== 'carried' && this.sameRoom(f.pos, t.pos);
          if (world.teams[atteam].flags.some(onGroundHere)) {
            flagDefended = true;
            if (!carrierDefended) this.scoreFrag(attacker, 1);
          }
          if (!carrierDefended && !flagDefended && world.teams[tateam].flags.some(onGroundHere)) this.scoreFrag(attacker, 1);
        }
      }
      if (t.stats.carriedFlag !== CarriedFlag.None) {
        if (!sameTeam) {
          a.stats.carriersKilled++;
          this.scoreFrag(attacker, 1); // portador inimigo: frag extra
        } else this.scoreFrag(attacker, -1);
      }
      if (!sameTeam) {
        addKill(a, type === DamageType.deathbringer);
        world.teams[atteam].kills++;
      }
    }
    // O original passa o tempo truncado para inteiro aqui (`static_cast<int>(get_time())`).
    addDeath(t, type === DamageType.deathbringer, Math.trunc(this.time));
    world.teams[tateam].deaths++;
    this.hooks.kill?.(attacker, target, type, t.stats.carriedFlag, carrierDefended, flagDefended);
    this.killPlayer(target, false);
  }

  /** `ServerWorld::killPlayer`. */
  killPlayer(target: number, timePenalty: boolean): void {
    const t = this.player(target);
    this.scoreNeg(target, 1);
    if (this.dropFlagIfAny(target)) this.scoreNeg(target, 1);
    if (t.deathbringer) this.world.explosions.push(new DeathbringerExplosion(this.frame, t.pos.clone(), target, t.team));
    if (this.settings.powerups.pupsDropAtDeath) this.dropPowerup(t);
    this.resetPlayer(target, t.deathbringer || timePenalty ? this.settings.world.waitingTimeDeathbringer : 0);
  }

  /** `ServerWorld::resetPlayer`: tira o jogador do jogo e programa o respawn. */
  resetPlayer(target: number, timePenalty: number): void {
    const t = this.player(target);
    t.health = 0;
    t.energy = 0;
    t.visibility = 255;
    t.power = false;
    t.turbo = false;
    t.vel = new Vec(0, 0);
    this.dropFlagIfAny(target);
    const sizes = [0, 0];
    this.world.players.forEach((p, i) => {
      if (p) (sizes[this.teamOf(i)] as number)++;
    });
    const team = this.teamOf(target);
    let [base, extra] = respawnTime(this.settings, sizes[team] as number, sizes[1 - team] as number);
    base += timePenalty;
    if (base < 0) {
      extra += base;
      base = 0;
    }
    t.framesToRespawn = iroundBound(base * 10);
    t.extraFramesToRespawn = iroundBound(Math.max(0, extra) * 10);
    statsKill(t, this.time);
    t.dead = true;
  }

  /** `ServerWorld::suicide`: −1 frag, conta como morte e suicídio, com a penalidade de tempo. */
  suicide(pid: number): void {
    const pl = this.player(pid);
    if (pl.dead) return;
    this.scoreFrag(pid, -1);
    addDeath(pl, false, Math.trunc(this.time));
    pl.stats.suicides++;
    const team = this.world.teams[this.teamOf(pid)];
    team.suicides++;
    team.deaths++;
    this.hooks.suicide?.(pid, pl.stats.carriedFlag);
    this.killPlayer(pid, true);
  }

  // ---------------------------------------------------------------- bandeiras (OG-027)

  /**
   * Bandeiras do mapa no início da partida (`Server::load_rotation_map`): com `random_wild_flag`, só
   * uma selvagem sorteada; com os três tipos, remove os que os locks tornariam inúteis.
   */
  loadMapFlags(): void {
    const world = this.world;
    const map = world.map;
    const w = this.settings.world;
    const toFlag = (c: WorldCoords) => new FlagState(new Position(c.room.x, c.room.y, c.x, c.y), new Position(c.room.x, c.room.y, c.x, c.y));
    world.teams[0].flags = map.teams[0].flags.map(toFlag);
    world.teams[1].flags = map.teams[1].flags.map(toFlag);
    world.wildFlags = map.wildFlags.map(toFlag);
    if (w.randomWildFlag) {
      world.teams[0].flags = [];
      world.teams[1].flags = [];
      world.wildFlags = [];
      this.addRandomFlag(2);
      return;
    }
    if (!this.allKindsOfFlagsExist()) return;
    if (w.lockTeamFlags && (w.lockWildFlags || !w.captureOnTeamFlag)) {
      world.teams[0].flags = [];
      world.teams[1].flags = [];
      if (w.lockWildFlags) world.wildFlags = [];
    } else if (w.lockWildFlags && !w.captureOnWildFlag) world.wildFlags = [];
  }

  /** `add_random_flag`: até 100 sorteios de sala e posição fora das paredes. */
  addRandomFlag(team: number): void {
    const map = this.world.map;
    for (let i = 0; i < 100; ++i) {
      const rx = this.rng.rand() % map.width;
      const ry = this.rng.rand() % map.height;
      const x = this.rng.rand() % ROOM_WIDTH;
      const y = this.rng.rand() % ROOM_HEIGHT;
      if (!map.fallOnWallCirc({ room: { x: rx, y: ry }, x, y }, FLAG_RADIUS)) {
        this.world.flagsOf(team).push(new FlagState(new Position(rx, ry, x, y), new Position(rx, ry, x, y)));
        return;
      }
    }
  }

  /**
   * Regras de bandeira em vigor, como o servidor as anuncia aos clientes (`flagModeMask`,
   * src/servnet.cpp:1949-1958); os bots decidem com elas.
   */
  flagModes(): {
    seeMinimapProperties: number;
    carryOwnTeamFlag: boolean;
    captureAwayFromBase: boolean;
    lockTeamFlags: boolean;
    lockWildFlags: boolean;
    captureOnTeamFlags: boolean;
    captureOnWildFlags: boolean;
  } {
    const w = this.settings.world;
    return {
      seeMinimapProperties: w.seeMinimapPlayerProperties,
      carryOwnTeamFlag: w.carryOwnTeamFlag,
      captureAwayFromBase: w.captureAwayFromBase,
      lockTeamFlags: this.lockTeamFlagsInEffect(),
      lockWildFlags: this.lockWildFlagsInEffect(),
      captureOnTeamFlags: this.captureOnTeamFlagsInEffect(),
      captureOnWildFlags: this.captureOnWildFlagsInEffect(),
    };
  }

  private lockWildFlagsInEffect(): boolean {
    return this.settings.world.lockWildFlags && this.allKindsOfFlagsExist();
  }

  private captureOnTeamFlagsInEffect(): boolean {
    return this.settings.world.captureOnTeamFlag || !this.allKindsOfFlagsExist();
  }

  private captureOnWildFlagsInEffect(): boolean {
    return this.settings.world.captureOnWildFlag || !this.allKindsOfFlagsExist();
  }

  /** Bandeira carregada pelo jogador, procurando nos times 0, 1 e nas selvagens, nessa ordem. */
  private carriedFlagOf(pid: number): { team: number; index: number } | undefined {
    for (let team = 0; team < 3; team++) {
      const index = this.world.flagsOf(team).findIndex((f) => f.carrier === pid);
      if (index !== -1) return { team, index };
    }
    return undefined;
  }

  private flagType(pid: number, flagTeam: number): CarriedFlag {
    return flagTeam === 2 ? CarriedFlag.Wild : flagTeam === this.teamOf(pid) ? CarriedFlag.Own : CarriedFlag.Enemy;
  }

  /** `ServerWorld::returnFlag`. */
  returnFlag(team: number, index: number): void {
    (this.world.flagsOf(team)[index] as FlagState).returnToBase();
    this.hooks.flagsChanged?.(team);
  }

  /** `ServerWorld::returnAllFlags`. */
  returnAllFlags(): void {
    for (let team = 0; team < 3; team++) {
      for (const f of this.world.flagsOf(team)) f.returnToBase();
      this.hooks.flagsChanged?.(team);
    }
  }

  /** `ServerWorld::dropFlag`: só bandeiras de time guardam a hora (em frames / 10) para a devolução. */
  private dropFlag(team: number, index: number, pos: Position): void {
    const flag = this.world.flagsOf(team)[index] as FlagState;
    flag.dropAt(pos);
    if (team !== 2) flag.dropTime = this.frame / 10;
    this.hooks.flagsChanged?.(team);
  }

  /**
   * `dropFlagIfAny`: larga a bandeira onde o jogador está. `purpose`: largou de propósito (desfaz o
   * frag ganho ao pegar); `captureDrop`: entregou numa captura (não conta como largada).
   */
  dropFlagIfAny(pid: number, purpose = false, captureDrop = false): boolean {
    const pl = this.player(pid);
    if (pl.stats.carriedFlag === CarriedFlag.None) return false;
    const carried = this.carriedFlagOf(pid);
    if (!carried) throw new Error(`jogador ${pid} marcado como portador sem bandeira`);
    addFlagDrop(pl.stats, this.time, !captureDrop);
    if (!captureDrop) this.world.teams[this.teamOf(pid)].flagsDropped++;
    this.dropFlag(carried.team, carried.index, pl.pos.clone());
    if (purpose) {
      // morrendo, os clientes já sabem que a bandeira caiu
      this.hooks.flagDropped?.(pid, this.flagType(pid, carried.team), captureDrop);
      if (!captureDrop) this.scoreFrag(pid, -1);
    }
    return true;
  }

  /** Tecla de largar bandeira (`data_drop_flag` / `data_stop_drop_flag`), aplicada com os controles. */
  setDropKey(pid: number, pressed: boolean): void {
    const pl = this.player(pid);
    if (pressed && !pl.dropKey) {
      pl.dropKey = true;
      if (!pl.underDeathbringerEffect(this.time)) {
        pl.droppedFlag = true;
        this.dropFlagIfAny(pid, true);
      }
    } else if (!pressed) pl.dropKey = false;
  }

  /** `resetCarrierData`: esquece o jogador como portador anterior (saiu ou trocou de time). */
  resetCarrierData(pid: number): void {
    for (const f of this.world.flagsOf(1 - this.teamOf(pid))) f.forgetCarrier(pid);
    for (const f of this.world.wildFlags) f.forgetCarrier(pid);
  }

  /** `check_flag_touch`: na mesma sala e a menos de 30 px; portadores aliados só precisam se tocar. */
  private checkFlagTouch(flag: FlagState, pl: PlayerState): boolean {
    const carried = flag.status === 'carried';
    const pos = carried ? this.player(flag.carrier).pos : flag.pos;
    if (!this.sameRoom(pos, pl.pos)) return false;
    if (carried && this.carrierCollisions.has(`${pl.pid},${flag.carrier}`)) return true;
    return pos.local().sub(pl.pos.local()).mag2() < sqr(PLAYER_RADIUS + FLAG_RADIUS);
  }

  /** `player_steals_flag`: +1 frag (desfeito se largar de propósito) e revela o shadow. */
  private playerStealsFlag(pid: number, team: number, index: number): void {
    const pl = this.player(pid);
    this.scoreFrag(pid, 1);
    const type = this.flagType(pid, team);
    addFlagTake(pl.stats, this.time, type);
    this.world.teams[this.teamOf(pid)].flagsTaken++;
    this.hooks.flagTaken?.(pid, type);
    (this.world.flagsOf(team)[index] as FlagState).take(pid, this.time);
    this.hooks.flagsChanged?.(team);
    if (pl.hasShadow()) pl.visibility = MAXIMUM_SHADOW_VISIBILITY;
  }

  /**
   * `player_captures_flag`: +2 para o time, −1 de ranking para o adversário (exceto selvagem), +3 para
   * o capturador e o assistente; ponto e registro no placar; devolve a bandeira capturada.
   */
  private playerCapturesFlag(pid: number, team: number, index: number, assistPid: number): void {
    const world = this.world;
    const myteam = this.teamOf(pid);
    // só um aliado pode ser assistente (−1 / TSIZE é 0 em C++, como Math.trunc)
    const assist = this.teamOf(assistPid) !== myteam ? -1 : assistPid;
    world.players.forEach((p, i) => {
      if (!p) return;
      if (this.teamOf(i) === myteam) this.scoreFrag(i, 2);
      else if (team !== 2) this.scoreNeg(i, 1);
    });
    this.scoreFrag(pid, 3);
    if (assist !== -1) {
      this.scoreFrag(assist, 3);
      this.player(assist).stats.assists++;
    }
    addCapture(this.player(pid).stats, this.time);
    const t = world.teams[myteam];
    t.score++;
    t.captures.push({ time: Math.trunc(world.mapTime() / 10), pid, assistPid: assist });
    this.returnFlag(team, index);
    this.hooks.flagCaptured?.(pid, team, assist);
    if (this.settings.world.respawnOnCapture) {
      for (const p of world.players) {
        if (!p) continue;
        p.framesToRespawn = 0; // os mortos renascem no próximo frame
        p.extraFramesToRespawn = 0;
      }
    }
  }

  /** `team_gets_carrying_point`: ponto por segurar a bandeira selvagem por `carrying_score_time`. */
  private teamGetsCarryingPoint(team: 0 | 1): void {
    this.world.players.forEach((p, i) => {
      if (!p) return;
      if (this.teamOf(i) === team) this.scoreFrag(i, 2);
      else this.scoreNeg(i, 1);
    });
    this.world.teams[team].score++;
  }

  /** O time atingiu o limite de capturas com a diferença mínima, ou é morte súbita na prorrogação. */
  private captureLimitReached(team: 0 | 1): boolean {
    const w = this.settings.world;
    const teams = this.world.teams;
    const score = teams[team].score;
    return (score >= w.captureLimit && w.captureLimit > 0 && score - teams[(1 - team) as 0 | 1].score >= w.winScoreDifference) || this.extraTimeAndSuddenDeath();
  }

  /** `extra_time_and_sudden_death`: morte súbita e o tempo do mapa acabou. */
  private extraTimeAndSuddenDeath(): boolean {
    return this.settings.world.suddenDeath && this.settings.world.timeLimit - this.world.mapTime() < 0;
  }

  /** `is_near_base_for_capture`: na base (ou, com `carry_own_team_flag`/selvagem, a até 15 px de uma). */
  private isNearBaseForCapture(flag: FlagState, team: number): boolean {
    if (!this.settings.world.carryOwnTeamFlag && team !== 2) return flag.status === 'base';
    // a bandeira pode ser de outro time que o da base, então status 'base' não serve de atalho
    const pos = flag.status === 'carried' ? this.player(flag.carrier).pos : flag.pos;
    return this.world.flagsOf(team).some((f) => this.sameRoom(pos, f.home) && pos.local().sub(f.home.local()).mag2() <= FLAG_RADIUS * FLAG_RADIUS);
  }

  /**
   * `try_capture` (src/world.cpp:3367): o portador leva a bandeira do time `carriedTeam` até uma
   * bandeira do time `targetTeam` na base `targetBase`. Quando alvo e base diferem é uma captura
   * reversa: a bandeira-alvo é a capturada.
   */
  private tryCapture(carrier: PlayerState, carriedTeam: number, carriedIndex: number, targetTeam: number, targetBase: number): boolean {
    const w = this.settings.world;
    const myteam = carrier.team;
    const enemyTeam = 1 - myteam;
    if (this.captureOnTeamFlagsInEffect() && targetBase === myteam && (targetTeam === myteam || carriedTeam === myteam)) {
      // ok
    } else if (this.captureOnWildFlagsInEffect() && targetBase === 2 && (targetTeam === 2 || carriedTeam === 2)) {
      // ok
    } else return false;

    const reverse = targetTeam !== targetBase;
    const carried = this.world.flagsOf(carriedTeam)[carriedIndex] as FlagState;
    const targets = this.world.flagsOf(targetTeam);
    const time = this.time;
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      const target = targets[targetIndex] as FlagState;
      const nearBase = w.captureAwayFromBase || this.isNearBaseForCapture(target, targetBase) || this.isNearBaseForCapture(carried, targetBase);
      if (!nearBase) continue;
      if (target.status === 'carried' && this.teamOf(target.carrier) !== myteam) continue; // com inimigo
      if (carriedTeam === targetTeam && carriedIndex === targetIndex) continue; // sobre ela mesma
      if (carriedTeam === myteam && target.status === 'carried') continue; // quem traz a inimiga/selvagem captura
      if (carriedTeam === 2 && targetTeam === enemyTeam && target.status === 'carried') continue; // idem
      if (!this.checkFlagTouch(target, carrier)) continue;
      if (time < carried.grabTime + w.minCaptureTime && (target.status === 'base' || time < target.grabTime + w.minCaptureTime)) continue;

      // assistente: aliado que carrega a bandeira-alvo, ou o portador anterior da bandeira trazida,
      // ou o portador anterior da bandeira-alvo
      let assistPid = carried.prevCarrier;
      if (target.status === 'carried') assistPid = target.carrier;
      else if ((assistPid === -1 || this.teamOf(assistPid) !== myteam) && target.prevCarrier !== carrier.pid) assistPid = target.prevCarrier;
      this.playerCapturesFlag(carrier.pid, reverse ? targetTeam : carriedTeam, reverse ? targetIndex : carriedIndex, assistPid);
      if (target.status === 'carried') this.dropFlagIfAny(assistPid, true, true);
      if (!reverse && target.status !== 'base') this.returnFlag(targetTeam, targetIndex);
      else if (reverse) this.returnFlag(carriedTeam, carriedIndex);
      if (this.captureLimitReached(myteam)) this.endGame('captureLimit');
      return true;
    }
    return false;
  }

  /** Pegar, devolver e capturar bandeiras (fim de `simulatePlayerPostPhysics`). */
  private flagInteractions(pl: PlayerState): void {
    const world = this.world;
    const w = this.settings.world;
    const myteam = pl.team;
    const enemyteam = (1 - myteam) as 0 | 1;

    // pegar: ft 0 = inimiga, 1 = selvagem, 2 = do próprio time (com carry_own_team_flag)
    let touchesFlag = false;
    for (let ft = 0; ft < 3; ft++) {
      if (pl.stats.carriedFlag !== CarriedFlag.None) break;
      if ((ft === 0 || ft === 2) && this.lockTeamFlagsInEffect()) continue;
      if (ft === 1 && this.lockWildFlagsInEffect()) continue;
      let flagTeam: number;
      if (ft === 0) flagTeam = enemyteam;
      else if (ft === 1) flagTeam = 2;
      else {
        if (!w.carryOwnTeamFlag) continue;
        flagTeam = myteam;
      }
      const flags = world.flagsOf(flagTeam);
      for (let f = 0; f < flags.length; f++) {
        const flag = flags[f] as FlagState;
        if (flag.status === 'carried' || !this.checkFlagTouch(flag, pl)) continue;
        touchesFlag = true;
        // quem acabou de largar não pega de volta até sair de cima
        if (!pl.droppedFlag && !pl.dropKey) {
          this.playerStealsFlag(pl.pid, flagTeam, f);
          break; // uma bandeira só
        }
      }
    }
    if (!pl.dropKey && !touchesFlag) pl.droppedFlag = false;

    // devolver (selvagens não são devolvidas)
    if (!w.carryOwnTeamFlag) {
      world.teams[myteam].flags.forEach((flag, f) => {
        if (flag.status === 'dropped' && this.checkFlagTouch(flag, pl) && this.frame / 10 >= flag.dropTime + w.flagReturnDelay) {
          this.scoreFrag(pl.pid, 1);
          pl.stats.flagsReturned++;
          world.teams[myteam].flagsReturned++;
          this.hooks.flagReturned?.(pl.pid);
          this.returnFlag(myteam, f);
        }
      });
    }

    if (pl.stats.carriedFlag === CarriedFlag.None) return; // capturas são só para portadores
    const carried = this.carriedFlagOf(pl.pid);
    if (!carried) throw new Error(`jogador ${pl.pid} marcado como portador sem bandeira`);
    const { team: flagTeam, index } = carried;
    // As 13 combinações de captura válidas estão em plan/specs/bandeiras-captura.md.
    if (flagTeam === 2) {
      void (this.tryCapture(pl, 2, index, myteam, myteam) || this.tryCapture(pl, 2, index, enemyteam, 2) || this.tryCapture(pl, 2, index, 2, 2));
    } else if (flagTeam === enemyteam) {
      void (this.tryCapture(pl, flagTeam, index, myteam, myteam) || this.tryCapture(pl, flagTeam, index, 2, 2));
    } else {
      void (this.tryCapture(pl, flagTeam, index, enemyteam, myteam) || this.tryCapture(pl, flagTeam, index, 2, myteam));
    }
  }

  /** Pontos por segurar a bandeira selvagem (só em mapas sem bandeiras de time). Devolve se a partida acabou. */
  private carryingScore(): boolean {
    const world = this.world;
    const w = this.settings.world;
    if (!(w.carryingScoreTime > 0 && world.teams[0].flags.length === 0 && world.teams[1].flags.length === 0)) return false;
    for (const flag of world.wildFlags) {
      if (flag.status !== 'carried') continue;
      const team = this.teamOf(flag.carrier);
      flag.addCarryingTime(team);
      if (flag.carryingTime >= 10 * w.carryingScoreTime) {
        flag.carryingTime = 0;
        this.teamGetsCarryingPoint(team);
        if (this.captureLimitReached(team)) {
          this.endGame('captureLimit');
          return true;
        }
      }
    }
    return false;
  }

  /** `ServerWorld::rocketHitPlayerCallback`: dano, estatísticas, empurrão e remoção do foguete. */
  rocketHitPlayer(rid: number, pid: number): boolean {
    const rk = this.world.rockets[rid] as RocketState;
    const pl = this.player(pid);
    const physics = this.settings.physics;
    const hadShield = pl.shield !== 0;
    const sameTeam = rk.team === this.teamOf(pid);
    let damage = this.settings.world.rocketDamage;
    if (rk.power) damage = Math.trunc(this.settings.powerups.pupPowerDamage * damage);
    if (sameTeam) damage = Math.trunc(physics.friendlyFire * damage);
    this.damagePlayer(pid, rk.owner, damage, DamageType.rocket);
    if (!sameTeam) {
      // acertar um aliado não conta como acerto
      this.player(rk.owner).stats.hits++;
      this.world.teams[rk.team as 0 | 1].hits++;
    }
    pl.stats.shotsTaken++;
    this.world.teams[this.teamOf(pid)].shotsTaken++;
    if (!pl.dead) {
      // dividir pela velocidade do foguete remove seu efeito em rk.vel
      const mul = (15 / physics.rocketSpeed) * (sameTeam ? physics.friendlyFire : 1);
      pl.vel = pl.vel.add(rk.vel.mul(mul));
    }
    this.hooks.rocketRemoved?.(rid, Math.trunc(rk.pos.x), Math.trunc(rk.pos.y), pid, !hadShield);
    this.deleteRocket(rid);
    return pl.dead;
  }

  // ---------------------------------------------------------------- colisões entre jogadores (OG-023)

  /** `ServerWorld::playerHitPlayerCallback` (src/world.cpp:2545). */
  playerHitPlayer(pid1: number, pid2: number, speedIn: number): PlayerHitResult {
    const pl1 = this.player(pid1);
    const pl2 = this.player(pid2);
    const w = this.settings.world;
    if (w.carryOwnTeamFlag && pl1.stats.carriedFlag !== CarriedFlag.None && pl2.stats.carriedFlag !== CarriedFlag.None && pl1.team === pl2.team) {
      this.carrierCollisions.add(`${pid1},${pid2}`);
      this.carrierCollisions.add(`${pid2},${pid1}`);
    }
    if (this.settings.physics.playerCollisions !== 'special') return { deaths: [false, false], bounceStrength1: 1, bounceStrength2: 1 };

    // velocidade relativa normalizada pela velocidade máxima de corrida (fixa no servidor, RN-FIS-07)
    const speed = speedIn / this.settings.physics.maxRunSpeed;
    let tossA = false;
    let tossB = false;
    const time = this.time;

    // shadow: revela ao bater num inimigo; compartilha 3 s com o aliado sem shadow
    const shadowTransferTime = 3;
    const shadowMin = w.shadowMinimum;
    const shareShadow = (from: PlayerState, to: PlayerState) => {
      if (!from.hasShadow()) return;
      if (from.team !== to.team) from.visibility = MAXIMUM_SHADOW_VISIBILITY;
      else if (!to.hasShadow() && from.shadowTime > time + shadowTransferTime) {
        to.visibility = shadowMin;
        to.shadowTime = time + shadowTransferTime;
        this.hooks.screenSample?.(to.pid, 'helmon');
      }
    };
    shareShadow(pl1, pl2);
    shareShadow(pl2, pl1);

    // turbo arremessa o outro
    if (pl1.turbo) tossB = true;
    if (pl2.turbo) tossA = true;

    const deathbringerEffectTime = 1;
    if (pl1.team !== pl2.team) {
      // "infecção" de deathbringer
      if (pl1.deathbringer && !pl2.deathbringer) {
        pl2.deathbringerEnd = time + deathbringerEffectTime;
        pl2.nextShootFrame = this.frame + iround(deathbringerEffectTime * 10);
        pl2.deathbringerAttacker = pid1;
        tossA = true;
        tossB = true;
        this.hooks.screenSample?.(pid2, 'hitdb');
      } else if (pl2.deathbringer && !pl1.deathbringer) {
        pl1.deathbringerEnd = time + deathbringerEffectTime;
        pl1.nextShootFrame = this.frame + iround(deathbringerEffectTime * 10);
        pl1.deathbringerAttacker = pid2;
        tossA = true;
        tossB = true;
        this.hooks.screenSample?.(pid1, 'hitdb');
      }

      // shield: dano proporcional à força da colisão
      const hitStun = iround(w.hitStunTime * 10);
      const shieldHitBy1 = pl1.shield !== 0 && pl1.deathbringerEnd < time && !pl2.deathbringer;
      const shieldHitBy2 = pl2.shield !== 0 && pl2.deathbringerEnd < time && !pl1.deathbringer;
      const shieldColdam = Math.trunc(speed * 60);
      if (shieldHitBy1) {
        tossB = true;
        pl2.nextShootFrame = this.frame + hitStun;
        if (shieldHitBy2) {
          tossA = true;
          pl1.nextShootFrame = this.frame + hitStun;
          pl1.energy = 0;
          pl2.energy = 0;
          pl1.shield = 0;
          pl2.shield = 0;
          this.hooks.screenSample?.(pid1, 'shieldl'); // vale para os dois
        } else this.damagePlayer(pid1, pid2, shieldColdam, DamageType.collision);
      } else if (shieldHitBy2) {
        tossA = true;
        pl1.nextShootFrame = this.frame + hitStun;
        this.damagePlayer(pid2, pid1, shieldColdam, DamageType.collision);
      }
      // vale nos dois sentidos (reavaliado depois dos efeitos acima, como no original)
      if (pl2.shield !== 0 && pl2.deathbringerEnd < time && !pl1.deathbringer) {
        tossA = true;
        this.damagePlayer(pid1, pid2, shieldColdam, DamageType.collision);
        this.damagePlayer(pid2, pid1, shieldColdam, DamageType.collision);
      }

      // "humilhação": power sem shield atropela inimigo sem shield nem power
      const powColdam = Math.trunc(speed * 80);
      if (pl1.power && !pl1.shield && pl1.deathbringerEnd < time && !pl2.deathbringer && !pl2.shield && !pl2.power) {
        this.damagePlayer(pid2, pid1, powColdam, DamageType.collision);
        tossB = true;
      }
      if (pl2.power && !pl2.shield && pl2.deathbringerEnd < time && !pl1.deathbringer && !pl1.shield && !pl1.power) {
        this.damagePlayer(pid1, pid2, powColdam, DamageType.collision);
        tossA = true;
      }
    }
    return { deaths: [pl1.dead, pl2.dead], bounceStrength1: tossA ? 2 : 1, bounceStrength2: tossB ? 2 : 1 };
  }

  // ---------------------------------------------------------------- vida e energia (OG-024)

  /** Regeneração por faixas, gastando o tempo do frame em ordem de prioridade. */
  regenerateHealthOrEnergy(pl: PlayerState): void {
    const w = this.settings.world;
    const p = this.settings.powerups;
    const maxHealth = pl.deathbringer ? Math.min(w.healthMax, p.deathbringerHealthLimit) : w.healthMax;
    const maxEnergy = pl.deathbringer ? Math.min(w.energyMax, p.deathbringerEnergyLimit) : w.energyMax;
    const left = { t: 0.1 };
    const h = { v: pl.health };
    const e = { v: pl.energy };
    const done =
      doRegenerate(h, 0, Math.min(maxHealth, 100), w.healthRegeneration0To100, left) ||
      doRegenerate(e, 0, Math.min(maxEnergy, 100), w.energyRegeneration0To100, left) ||
      doRegenerate(e, 100, Math.min(maxEnergy, 200), w.energyRegeneration100To200, left) ||
      doRegenerate(h, 100, Math.min(maxHealth, 200), w.healthRegeneration100To200, left) ||
      doRegenerate(e, 200, maxEnergy, w.energyRegeneration200ToMax, left);
    if (!done) doRegenerate(h, 200, maxHealth, w.healthRegeneration200ToMax, left);
    pl.health = h.v;
    pl.energy = e.v;
  }

  /** Correr gasta energia; sem energia, gasta vida até o piso. */
  degradeHealthOrEnergyForRunning(pl: PlayerState): void {
    const w = this.settings.world;
    let timeLeft = 0.1;
    if (pl.energy > 0) {
      pl.energy -= w.runEnergyDegradation * timeLeft;
      if (pl.energy >= 0) return;
      timeLeft = (0 - pl.energy) / w.runEnergyDegradation;
      pl.energy = 0;
    }
    if (pl.health > w.minHealthForRunPenalty) pl.health = Math.max(w.minHealthForRunPenalty, pl.health - w.runHealthDegradation * timeLeft);
  }

  // ---------------------------------------------------------------- power-ups (OG-025)

  /** `PowerupSettings::choose_powerup_kind`: sorteio ponderado pelas chances. */
  choosePowerupKind(): PowerupKind {
    const p = this.settings.powerups;
    const weights = [p.pupChanceShield, p.pupChanceTurbo, p.pupChanceShadow, p.pupChancePower, p.pupChanceWeapon, p.pupChanceMegahealth];
    const max = weights.reduce((a, b) => a + b, 0) + p.pupChanceDeathbringer;
    let chance = 1 + (this.rng.rand() % max);
    for (let kind = 0; kind < weights.length; kind++) {
      chance -= weights[kind] as number;
      if (chance <= 0) return kind as PowerupKind;
    }
    return PowerupKind.deathbringer;
  }

  /** `pups_by_percent`: porcentagem do número de salas, arredondada; ao menos 1 se > 0%; no máximo 32. */
  private pupsByPercent(percentage: number): number {
    const map = this.world.map;
    const result = Math.trunc((map.width * map.height * percentage + 50) / 100);
    if (result === 0 && percentage > 0) return 1;
    return Math.min(result, MAX_POWERUPS);
  }

  private minPups(): number {
    const p = this.settings.powerups;
    return p.pupsMinPercentage ? this.pupsByPercent(p.pupsMin) : p.pupsMin;
  }

  private maxPups(): number {
    const p = this.settings.powerups;
    return p.pupsMaxPercentage ? this.pupsByPercent(p.pupsMax) : p.pupsMax;
  }

  /**
   * `check_powerup_creation`: garante ao menos max(mínimo, nº de jogadores) power-ups (limitado ao
   * máximo), marcando slots livres para reaparecer (ou já posicionando, se `instant`).
   */
  checkPowerupCreation(instant: boolean): void {
    const items = this.world.items;
    let count = items.filter((it) => it.kind !== PowerupKind.unused).length;
    let realMin = Math.max(this.minPups(), this.world.playerCount());
    const realMax = this.maxPups();
    if (realMin > realMax) realMin = realMax;
    if (count >= realMin) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i] as PowerupState;
      if (it.kind !== PowerupKind.unused) continue;
      it.kind = PowerupKind.respawning;
      if (instant) this.respawnPowerup(i);
      else it.respawnTime = this.time + this.settings.powerups.pupsRespawnTime;
      if (++count >= realMin) break;
    }
  }

  /** `respawn_powerup`: sala sem jogadores e sem power-ups (com relaxamento) e posição longe de paredes. */
  respawnPowerup(index: number): void {
    const world = this.world;
    const item = world.items[index] as PowerupState;
    item.kind = PowerupKind.unused;
    const map = world.map;
    let pos: Position;
    for (let runaway = 300; ; --runaway) {
      // `RoomCoords(rand() % w, rand() % h)`: a ordem de avaliação dos argumentos não é definida
      // em C++; o GCC do jogo avalia da direita para a esquerda, então o primeiro rand() é o y.
      const ry = this.rng.rand() % map.height;
      const rx = this.rng.rand() % map.width;
      // nas primeiras 100 tentativas evita salas com jogadores; até a 200ª, salas com power-ups
      if (runaway > 200 && world.players.some((p) => p !== undefined && p.pos.roomX === rx && p.pos.roomY === ry)) continue;
      if (runaway > 100 && world.items.some((it) => it.kind !== PowerupKind.unused && it.pos.roomX === rx && it.pos.roomY === ry)) continue;
      const x = POWERUP_RADIUS + (this.rng.rand() % (ROOM_WIDTH - 2 * POWERUP_RADIUS));
      const y = POWERUP_RADIUS + (this.rng.rand() % (ROOM_HEIGHT - 2 * POWERUP_RADIUS));
      pos = new Position(rx, ry, x, y);
      if (!map.fallOnWallCirc({ room: { x: rx, y: ry }, x, y }, POWERUP_RADIUS)) break;
      if (--runaway < 0) return; // desiste: o slot fica vazio
    }
    item.kind = this.choosePowerupKind();
    item.pos = pos;
    this.hooks.powerupAppeared?.(index);
  }

  /** `PowerupSettings::addTime`. */
  private addTime(t: number): number {
    const p = this.settings.powerups;
    return Math.min(t + p.pupAddTime, p.pupMaxTime);
  }

  /** `game_touch_powerup` (src/world.cpp:2040): efeitos, limite por jogador e compartilhamento. */
  gameTouchPowerup(pid: number, k: number, teammateTouched = false): void {
    const it = this.world.items[k] as PowerupState;
    const pl = this.player(pid);
    const p = this.settings.powerups;
    const time = this.time;
    if (!teammateTouched) this.hooks.powerupPicked?.(k, it.pos.clone());
    // power-ups que o jogador já tem (megahealth não conta para o limite)
    const owned = [pl.shield !== 0, pl.turbo, pl.hasShadow(), pl.power, pl.weapon > 1, true, pl.deathbringer];
    const count = owned.filter((has, kind) => has && kind !== PowerupKind.megahealth).length;
    if (!owned[it.kind] && count >= p.pupsPlayerMax) this.dropWorstPowerup(pl);

    let share: boolean;
    switch (it.kind) {
      case PowerupKind.shield:
        share = p.teamShield;
        pl.shield = p.pupShieldHits ? p.pupShieldHits : 1;
        if (pl.health < 100) pl.health = 100;
        if (pl.energy < 200) pl.energy = Math.min(200, pl.energy + 100);
        this.hooks.screenSample?.(pid, 'shieldp');
        break;
      case PowerupKind.turbo: {
        share = p.teamTurbo;
        let itemTime = pl.turboTime - time;
        if (!pl.turbo || itemTime < 0) itemTime = 0;
        itemTime = this.addTime(itemTime);
        pl.turbo = true;
        pl.turboTime = time + itemTime;
        this.hooks.screenSample?.(pid, 'speedon');
        break;
      }
      case PowerupKind.shadow: {
        share = p.teamShadow;
        let itemTime = pl.shadowTime - time;
        if (!pl.hasShadow() || itemTime < 0) itemTime = 0;
        itemTime = this.addTime(itemTime);
        pl.visibility = this.settings.world.shadowMinimum;
        pl.shadowTime = time + itemTime;
        this.hooks.screenSample?.(pid, 'helmon');
        break;
      }
      case PowerupKind.power: {
        share = p.teamPower;
        let itemTime = pl.powerTime - time;
        if (!pl.power || itemTime < 0) itemTime = 0;
        itemTime = this.addTime(itemTime);
        pl.power = true;
        pl.powerTime = time + itemTime;
        this.hooks.screenSample?.(pid, 'quadon');
        break;
      }
      case PowerupKind.weapon:
        share = p.teamWeapon;
        if (pl.energy < 200) pl.energy = Math.min(200, pl.energy + 100);
        if (pl.weapon < p.pupWeaponMax) pl.weapon++;
        this.hooks.screenSample?.(pid, 'weaponup');
        break;
      case PowerupKind.megahealth:
        share = p.teamHealth;
        pl.megabonus += p.pupHealthBonus;
        this.hooks.screenSample?.(pid, 'megaheal');
        break;
      case PowerupKind.deathbringer:
        share = p.teamDeathbringer;
        if (p.pupDeathbringerSwitch && !teammateTouched) pl.deathbringer = !pl.deathbringer;
        else if (!pl.deathbringer) pl.deathbringer = true;
        this.hooks.screenSample?.(pid, 'getdb');
        break;
      default:
        throw new Error(`power-up inválido no slot ${k}: ${it.kind}`);
    }
    if (teammateTouched) return;
    if (share) {
      this.world.players.forEach((other, i) => {
        if (other && !other.dead && other.team === pl.team && i !== pid) this.gameTouchPowerup(i, k, true);
      });
    }
    it.kind = PowerupKind.unused;
    this.checkPowerupCreation(false);
  }

  /** `drop_worst_powerup`: primeiro o temporizado que acaba antes; depois deathbringer, shield, arma. */
  dropWorstPowerup(pl: PlayerState): void {
    if (pl.turbo || pl.hasShadow() || pl.power) {
      let minTime = 1e50;
      if (pl.turbo) minTime = pl.turboTime;
      if (pl.hasShadow() && pl.shadowTime < minTime) minTime = pl.shadowTime;
      // zera o tempo; a expiração acontece na pré-física do próximo frame
      if (pl.power && pl.powerTime < minTime) pl.powerTime = 0;
      else if (pl.turbo && pl.turboTime === minTime) pl.turboTime = 0;
      else pl.shadowTime = 0;
      return;
    }
    if (pl.deathbringer) {
      pl.deathbringer = false;
      this.hooks.screenSample?.(pl.pid, 'getdb');
    } else if (pl.shield) {
      pl.shield = 0;
      this.hooks.screenSample?.(pl.pid, 'shieldl');
    } else pl.weapon = 1;
  }

  /** `drop_powerup`: ao morrer, larga um dos power-ups (sorteado) na posição truncada. */
  dropPowerup(pl: PlayerState): void {
    const p = this.settings.powerups;
    const time = this.time;
    const half = Math.trunc(p.pupAddTime / 2); // divisão inteira no original
    const candidates: PowerupKind[] = [];
    if (pl.shield) candidates.push(PowerupKind.shield);
    if (pl.turbo && pl.turboTime - time >= half) candidates.push(PowerupKind.turbo);
    if (pl.hasShadow() && pl.shadowTime - time >= half) candidates.push(PowerupKind.shadow);
    if (pl.power && pl.powerTime - time >= half) candidates.push(PowerupKind.power);
    if (pl.weapon >= 2) candidates.push(PowerupKind.weapon);
    if (candidates.length === 0) return;
    const slot = this.world.items.find((it) => it.kind === PowerupKind.unused);
    if (!slot) return;
    slot.kind = candidates[this.rng.rand() % candidates.length] as PowerupKind;
    slot.pos = new Position(pl.pos.roomX, pl.pos.roomY, Math.trunc(pl.pos.x), Math.trunc(pl.pos.y));
    this.hooks.powerupAppeared?.(this.world.items.indexOf(slot));
  }

  // ---------------------------------------------------------------- etapas do frame

  /** `simulatePlayerPrePhysics` (sem o anti-flood do chat, que fica no servidor de salas). */
  prePhysics(pl: PlayerState): void {
    const time = this.time;
    if (pl.turbo && time > pl.turboTime) {
      pl.turbo = false;
      this.hooks.screenSample?.(pl.pid, 'speedoff');
    }
    if (pl.power && time > pl.powerTime) {
      pl.power = false;
      this.hooks.screenSample?.(pl.pid, 'quadoff');
    }
    if (pl.hasShadow() && time > pl.shadowTime) {
      pl.visibility = 255;
      this.hooks.screenSample?.(pl.pid, 'helmoff');
    }
    if (pl.hasShadow()) pl.visibility = Math.max(this.settings.world.shadowMinimum, pl.visibility - 10);
    if (pl.deathbringerEnd > time && !pl.dead) this.damagePlayer(pl.pid, pl.deathbringerAttacker, pl.shield ? 12 : 3, DamageType.deathbringer);
  }

  /** `simulatePlayerPostPhysics`: tiro, vida e energia, power-ups e bandeiras. */
  postPhysics(pl: PlayerState): void {
    if (pl.dead) return;
    const w = this.settings.world;
    const p = this.settings.powerups;
    if ((pl.attack || pl.attackOnce) && this.frame >= pl.nextShootFrame) {
      let shots = 1;
      pl.energy -= w.shootingEnergyBase;
      if (pl.energy < 0) pl.energy = 0;
      else {
        for (let k = 1; k < pl.weapon && pl.energy >= w.shootingEnergyPerExtraRocket; k++) {
          pl.energy -= w.shootingEnergyPerExtraRocket;
          ++shots;
        }
      }
      pl.nextShootFrame = this.frame + iround((pl.energy > 0 ? w.shootIntervalWithEnergy : w.shootInterval) * 10);
      if (pl.hasShadow()) pl.visibility = MAXIMUM_SHADOW_VISIBILITY;
      this.shootRockets(pl, shots);
    }
    pl.attackOnce = false;

    if (pl.deathbringerEnd < this.time) this.regenerateHealthOrEnergy(pl);
    if (isRun(pl.controls)) this.degradeHealthOrEnergyForRunning(pl);
    if (pl.deathbringer && pl.health > p.deathbringerHealthLimit) pl.health = Math.max(p.deathbringerHealthLimit, pl.health - p.deathbringerHealthDegradation / 10);
    if (pl.deathbringer && pl.energy > p.deathbringerEnergyLimit) pl.energy = Math.max(p.deathbringerEnergyLimit, pl.energy - p.deathbringerEnergyDegradation / 10);
    if (pl.megabonus > 0) {
      for (let mh = 0; mh < 5; mh++) {
        if (pl.megabonus > 0 && pl.health < w.healthMax) {
          pl.health++;
          pl.megabonus--;
        }
        if (pl.megabonus > 0 && pl.energy < w.energyMax) {
          pl.energy++;
          pl.megabonus--;
        }
      }
    }
    if (pl.health === w.healthMax && pl.energy === w.energyMax) pl.megabonus = 0;

    // power-ups tocados (quem está sob deathbringer não pega)
    if (!pl.underDeathbringerEffect(this.time)) {
      const r2 = sqr(POWERUP_RADIUS + PLAYER_RADIUS);
      this.world.items.forEach((item, k) => {
        if (item.isReal() && this.sameRoom(item.pos, pl.pos) && item.pos.local().sub(pl.pos.local()).mag2() < r2) this.gameTouchPowerup(pl.pid, k);
      });
    }

    if (pl.health > w.healthMax) pl.health = w.healthMax;
    if (pl.energy < 0) pl.energy = 0;
    else if (pl.energy > w.energyMax) pl.energy = w.energyMax;

    // sob efeito de deathbringer não se pega, larga, devolve nem captura bandeira
    if (pl.underDeathbringerEffect(this.time)) return;
    this.flagInteractions(pl);
  }

  /**
   * `ServerWorld::simulateFrame` (src/world.cpp:3447), na mesma ordem. O chamador avança
   * `world.frame` depois (o servidor original incrementa após enviar o frame).
   */
  simulateFrame(): void {
    const world = this.world;
    this.carrierCollisions.clear();
    const order = world.players.filter((p): p is PlayerState => p !== undefined);
    randomShuffle(order, this.rng);
    // (-1) power-ups cujo tempo de reaparecer chegou
    world.items.forEach((item, i) => {
      if (item.kind === PowerupKind.respawning && this.time > item.respawnTime) this.respawnPowerup(i);
    });
    for (const pl of order) this.prePhysics(pl);
    // remove do início as expiradas (todas duram o mesmo tempo e entram no fim)
    while (world.explosions.length > 0 && (world.explosions[0] as DeathbringerExplosion).expired(this.frame)) world.explosions.shift();
    for (const db of world.explosions) this.deathbringerHits(db);
    applyPhysics(this.physicsContext(), this.callbacks(), PLAYER_RADIUS, 1);
    this.respawnCountdown(order);
    for (const pl of order) this.postPhysics(pl);
    if (this.carryingScore()) return;
    this.checkTimeLimit();
  }

  /** Jogadores atingidos pelo anel da explosão neste frame (src/world.cpp:3468-3512). */
  private deathbringerHits(db: DeathbringerExplosion): void {
    const world = this.world;
    const radius = db.radius(this.frame);
    const physics = this.settings.physics;
    let newOutsideMask = 0;
    for (let ti = 0; ti < world.maxPlayers; ti++) {
      const target = world.players[ti];
      if (!target || target.dead || target.pos.roomX !== db.pos.roomX || target.pos.roomY !== db.pos.roomY) continue;
      const sameTeam = target.team === db.ownerTeam;
      if (sameTeam && !physics.friendlyDeathbringer) continue;
      const d = target.pos.local().sub(db.pos.local());
      const dist = d.mag();
      const bit = 2 ** ti; // equivalente a 1u << ti sem o sinal do JS
      if (dist > radius + 60) {
        newOutsideMask += bit; // na sala, fora do anel: pode ser atingido no próximo frame
        continue;
      }
      // já dentro do anel e não estava fora antes (vinha de outra sala ou já fora atingido)
      if (dist < radius - 10 && Math.floor(db.outsideMask / bit) % 2 === 0) continue;
      if (target.deathbringerEnd >= this.time || this.frame < target.startTakeDamageFrame) continue;
      target.deathbringerAttacker = db.ownerPid;
      // duração com ±10% aleatório; aliados (fogo amigo de deathbringer) recebem a fração configurada
      const duration = (this.settings.powerups.pupDeathbringerTime * (sameTeam ? physics.friendlyDeathbringer : 1) * (9000 + (this.rng.rand() % 2000))) / 10000;
      target.deathbringerEnd = this.time + duration;
      target.nextShootFrame = this.frame + iround(duration * 10);
      this.hooks.screenSample?.(target.pid, 'hitdb');
      if (dist !== 0) target.vel = d.mul(40 / dist); // empurra para fora com velocidade 40
    }
    db.outsideMask = newOutsideMask;
  }

  /** Contagem do respawn com fila justa entre os times (src/world.cpp:3516-3545). */
  private respawnCountdown(order: PlayerState[]): void {
    const respawners: [PlayerState[], PlayerState[]] = [[], []];
    for (const pl of order) {
      if (!pl.dead) continue;
      if (pl.framesToRespawn) --pl.framesToRespawn;
      else if (pl.extraFramesToRespawn) --pl.extraFramesToRespawn;
      if (!pl.awaitingClientReadies) respawners[pl.team].push(pl);
    }
    // std::sort com poucos elementos (< 16) usa inserção, que é estável como Array.sort.
    const byWait = (a: PlayerState, b: PlayerState) => a.extraFramesToRespawn - b.extraFramesToRespawn || a.framesToRespawn - b.framesToRespawn;
    respawners[0].sort(byWait);
    respawners[1].sort(byWait);
    let i0 = 0;
    let i1 = 0;
    for (;;) {
      let p0 = respawners[0][i0];
      let p1 = respawners[1][i1];
      if (!p0 && !p1) break;
      if (p1 && (!p0 || p1.extraFramesToRespawn < p0.extraFramesToRespawn)) {
        [p0, p1] = [p1, p0];
        ++i1;
      } else ++i0;
      const first = p0 as PlayerState;
      if (p1) {
        p1.extraFramesToRespawn -= first.extraFramesToRespawn;
        first.extraFramesToRespawn = 0;
      }
      if (first.extraFramesToRespawn === 0 && first.framesToRespawn === 0) this.respawnPlayer(first.pid);
    }
  }

  // ---------------------------------------------------------------- ciclo da partida (OG-029)

  /**
   * `ServerWorld::respawnPlayer` (src/world.cpp:1807): no ponto de spawn seguinte (início do mapa),
   * numa área de respawn sorteada do time ou numa sala desocupada sorteada, longe de paredes.
   */
  respawnPlayer(pid: number, dontInformClients = false): void {
    const world = this.world;
    const map = world.map;
    const pl = this.player(pid);
    const team = this.teamOf(pid);
    const mapTeam = map.teams[team];
    let pos: Position;
    if (mapTeam.spawn.length === 0) pl.respawnToBase = false;
    if (pl.respawnToBase) {
      if (++world.lastSpawn[team] >= mapTeam.spawn.length) world.lastSpawn[team] = 0;
      const c = mapTeam.spawn[world.lastSpawn[team]] as WorldCoords;
      pos = new Position(c.room.x, c.room.y, c.x, c.y);
    } else if (mapTeam.respawn.length > 0) {
      const area = mapTeam.respawn[this.rng.rand() % mapTeam.respawn.length] as WorldRect;
      let x: number;
      let y: number;
      // as áreas são validadas na carga para não terem parede demais: logo acha um lugar
      do {
        x = area.x1 + (this.rng.rand() % (Math.trunc(area.x2 - area.x1) + 1));
        y = area.y1 + (this.rng.rand() % (Math.trunc(area.y2 - area.y1) + 1));
      } while (map.fallOnWallCirc({ room: area.room, x, y }, PLAYER_RADIUS));
      pos = new Position(area.room.x, area.room.y, x, y);
    } else {
      // sala sem jogadores (nas primeiras 200 tentativas) e posição fora das paredes
      const occupied = new Array<boolean>(map.width * map.height).fill(false);
      for (const p of world.players) {
        if (p && p.pos.roomX >= 0 && p.pos.roomY >= 0 && p.pos.roomX < map.width && p.pos.roomY < map.height) occupied[p.pos.roomY * map.width + p.pos.roomX] = true;
      }
      let runaway = 400;
      let rx: number;
      let ry: number;
      let x: number;
      let y: number;
      do {
        let ridx: number;
        do {
          ridx = this.rng.rand() % (map.width * map.height);
        } while (runaway-- > 200 && occupied[ridx]);
        rx = ridx % map.width;
        ry = Math.trunc(ridx / map.width);
        x = PLAYER_RADIUS + (this.rng.rand() % (ROOM_WIDTH - 2 * PLAYER_RADIUS));
        y = PLAYER_RADIUS + (this.rng.rand() % (ROOM_HEIGHT - 2 * PLAYER_RADIUS));
        if (!map.fallOnWallCirc({ room: { x: rx, y: ry }, x, y }, PLAYER_RADIUS)) break;
      } while (runaway-- > 0);
      pos = new Position(rx, ry, x, y);
    }

    const w = this.settings.world;
    const p = this.settings.powerups;
    const time = this.time;
    pl.pos = pos;
    pl.vel = new Vec(0, 0);
    pl.health = w.startHealth;
    pl.energy = w.startEnergy;
    pl.megabonus = 0;
    pl.weapon = p.startWeapon;
    pl.shield = p.startShield ? 1 : 0; // bool copiado para o contador de acertos
    pl.power = p.startPower !== 0;
    pl.powerTime = time + p.startPower;
    pl.turbo = p.startTurbo !== 0;
    pl.turboTime = time + p.startTurbo;
    pl.visibility = p.startShadow ? w.shadowMinimum : 255;
    pl.shadowTime = time + p.startShadow;
    pl.deathbringer = p.startDeathbringer;
    pl.deathbringerEnd = 0;
    pl.respawnToBase = false;
    // proteção de spawn: sem tiro nem dano até lá
    pl.nextShootFrame = pl.startTakeDamageFrame = this.frame + iround(w.spawnSafeTime * 10);
    pl.attackOnce = false;
    pl.dead = false;
    pl.stats.spawnTime = time;
    pl.stats.dead = false;
    if (!dontInformClients) this.hooks.playerSpawned?.(pid);
    this.hooks.playerScreenChange?.(pid);
  }

  /**
   * `ServerWorld::reset` (início de mapa, `ctf_game_restart`): bandeiras na base, placar e
   * estatísticas zerados, sem itens nem foguetes, e todos mortos esperando para nascer na base.
   */
  resetWorld(): void {
    const world = this.world;
    this.returnAllFlags();
    for (const team of world.teams) {
      Object.assign(team, { score: 0, kills: 0, deaths: 0, suicides: 0, flagsTaken: 0, flagsDropped: 0, flagsReturned: 0, shots: 0, hits: 0, shotsTaken: 0, movement: 0 });
      team.captures = [];
    }
    for (const item of world.items) item.kind = PowerupKind.unused;
    for (const rk of world.rockets) rk.owner = -1;
    world.explosions = [];
    world.extraTimePeriod = 1;
    for (const pl of world.players) {
      if (!pl) continue;
      const startTime = pl.stats.startTime;
      pl.stats = { ...newStats(), startTime };
      pl.respawnToBase = true;
      this.respawnPlayer(pl.pid, true); // vai para um spawn esperar o jogo
      this.resetPlayer(pl.pid, -1e10); // morto, sem espera: nasce assim que o cliente estiver pronto
      pl.respawnToBase = true; // no começo do mapa sempre nasce na base
    }
  }

  /**
   * Troca de mapa no fim da partida (`load_rotation_map` + `ctf_game_restart`): o relógio do mapa
   * recomeça, as bandeiras são as do novo mapa e o mundo é reiniciado. O balanceamento de times
   * fica com o servidor de sala, antes desta chamada.
   */
  changeMap(map: GameMap): void {
    const world = this.world;
    world.map = map;
    world.mapStartFrame = this.frame;
    world.lastSpawn = [0, 0];
    this.loadMapFlags();
    this.resetWorld();
  }

  /**
   * Jogador entra na sala (parte do mundo de `client_connected`): vai para um spawn e fica morto
   * até o cliente carregar o mapa (`clientReady`); nasce na base. O pid e o time são escolhidos
   * pelo servidor de sala.
   */
  addPlayer(pid: number): PlayerState {
    const world = this.world;
    if (world.players[pid]) throw new Error(`pid ${pid} ocupado`);
    const pl = new PlayerState(pid, world.teamOf(pid));
    pl.stats.startTime = this.time;
    pl.awaitingClientReadies = 1; // `send_map_change_message` ao entrar
    world.players[pid] = pl;
    pl.respawnToBase = true;
    this.respawnPlayer(pid, true);
    this.resetPlayer(pid, -1e10);
    pl.respawnToBase = true;
    pl.stats.lifetime = 0;
    this.checkPowerupCreation(false);
    return pl;
  }

  /** `ServerWorld::removePlayer`: foguetes do jogador somem, deathbringers ficam sem dono e a bandeira cai. */
  removePlayer(pid: number): void {
    const world = this.world;
    this.player(pid);
    world.rockets.forEach((rk, rid) => {
      if (rk.owner !== pid) return;
      this.hooks.rocketRemoved?.(rid, 0, 0, -1, false);
      this.deleteRocket(rid);
    });
    if (world.maxPlayers < MAX_PLAYERS) {
      // pid fictício para o atacante das mortes que ainda vão acontecer
      for (const db of world.explosions) if (db.ownerPid === pid) db.ownerPid = MAX_PLAYERS - 1;
      for (const p of world.players) if (p && p.deathbringerAttacker === pid) p.deathbringerAttacker = MAX_PLAYERS - 1;
    }
    this.dropFlagIfAny(pid, true);
    this.resetCarrierData(pid);
    world.players[pid] = undefined;
  }

  /**
   * Parte de mundo de `Server::move_player` (src/server.cpp:323): larga a bandeira, reinicia o jogador
   * se estiver vivo e o leva para o slot livre `to` do outro time, com os foguetes, explosões e
   * ataques de deathbringer (`changeEmbeddedPids`).
   */
  movePlayer(from: number, to: number): PlayerState {
    const world = this.world;
    const old = this.player(from);
    if (world.players[to]) throw new Error(`pid ${to} ocupado`);
    this.dropFlagIfAny(from, true);
    if (!old.dead) this.resetPlayer(from, 0);
    const moved = Object.assign(new PlayerState(to, world.teamOf(to)), old, { pid: to, team: world.teamOf(to) });
    world.players[to] = moved;
    world.players[from] = undefined;
    for (const rk of world.rockets) if (rk.owner === from) rk.owner = to;
    for (const db of world.explosions) if (db.ownerPid === from) db.ownerPid = to;
    for (const p of world.players) if (p && p.deathbringerAttacker === from) p.deathbringerAttacker = to;
    this.resetCarrierData(from);
    return moved;
  }

  /** Parte de mundo de `Server::swap_players` (src/server.cpp:354) e `swapEmbeddedPids`. */
  swapPlayers(a: number, b: number): void {
    const world = this.world;
    const pa = this.player(a);
    const pb = this.player(b);
    this.dropFlagIfAny(a, true);
    this.dropFlagIfAny(b, true);
    this.resetCarrierData(a);
    this.resetCarrierData(b);
    if (!pa.dead) this.resetPlayer(a, 0);
    if (!pb.dead) this.resetPlayer(b, 0);
    world.players[a] = Object.assign(new PlayerState(a, world.teamOf(a)), pb, { pid: a, team: world.teamOf(a) });
    world.players[b] = Object.assign(new PlayerState(b, world.teamOf(b)), pa, { pid: b, team: world.teamOf(b) });
    const swap = (pid: number) => (pid === a ? b : pid === b ? a : pid);
    for (const rk of world.rockets) if (rk.owner !== -1) rk.owner = swap(rk.owner);
    for (const db of world.explosions) db.ownerPid = swap(db.ownerPid);
    for (const p of world.players) if (p) p.deathbringerAttacker = swap(p.deathbringerAttacker);
  }

  /** `ServerWorld::start_game`: o relógio do mapa começa e os power-ups iniciais aparecem. */
  startGame(): void {
    this.world.mapStartFrame = this.frame;
    this.world.gameOver = null;
    this.checkPowerupCreation(true);
  }

  private endGame(reason: GameOverReason): void {
    this.world.gameOver = reason;
    const result = finishMatch(this.world, reason, this.time);
    this.hooks.gameOver?.(reason, result);
  }

  /** Limite de tempo, avisos, prorrogação e morte súbita (fim de `simulateFrame`). */
  private checkTimeLimit(): void {
    const world = this.world;
    const w = this.settings.world;
    const timeLimit = w.timeLimit;
    if (!(world.playerCount() > 1 && timeLimit > 0)) return; // sozinho não há limite de tempo
    const timeLeft = timeLimit - world.mapTime();
    const tied = world.teams[0].score === world.teams[1].score;
    if (timeLimit >= 10 * 60 * 10 && timeLeft === 5 * 60 * 10) this.hooks.timeWarning?.(300);
    else if (timeLimit >= 2 * 60 * 10 && timeLeft === 60 * 10) this.hooks.timeWarning?.(60);
    else if (timeLimit >= 60 * 10 && timeLeft === 30 * 10) this.hooks.timeWarning?.(30);
    // acaba no fim do tempo se não houver empate ou não houver prorrogação nem morte súbita
    else if (timeLeft === 0 && (!tied || (w.extraTime === 0 && !w.suddenDeath))) this.endGame('timeOut');
    else if (timeLimit + world.extraTimePeriod * w.extraTime - world.mapTime() === 0 && w.extraTime > 0) {
      if (w.extraTimePeriods > world.extraTimePeriod && tied) {
        world.extraTimePeriod++;
        this.hooks.extraTimePeriodStarted?.(world.extraTimePeriod);
      } else this.endGame('extraTimeOut');
    } else if (timeLeft === 0) {
      world.extraTimePeriod = 1;
      this.hooks.normalTimeOut?.(w.suddenDeath);
    }
  }

  /** Callbacks de física do servidor (`ServerPhysicsCallbacks`). */
  callbacks(): PhysicsCallbacks {
    const world = this.world;
    return {
      collideToRockets: () => true,
      collidesToRockets: (pid) => this.frame >= this.player(pid).startTakeDamageFrame,
      collidesToPlayers: (pid) => this.frame >= this.player(pid).startTakeDamageFrame,
      gatherMovementDistance: () => true,
      allowRoomChange: () => true,
      addMovementDistance: (pid, distance) => {
        const pl = this.player(pid);
        pl.stats.movement += distance;
        world.teams[this.teamOf(pid)].movement += distance;
      },
      playerScreenChange: (pid) => this.hooks.playerScreenChange?.(pid),
      rocketHitWall: (rid) => this.deleteRocket(rid),
      rocketHitPlayer: (rid, pid) => this.rocketHitPlayer(rid, pid),
      playerHitWall: () => {},
      playerHitPlayer: (a, b, speed) => this.playerHitPlayer(a, b, speed),
      rocketOutOfBounds: (rid) => this.deleteRocket(rid),
      shouldApplyPhysicsToPlayer: (pid) => !this.player(pid).dead,
    };
  }

  /** Quique entre dois jogadores com os callbacks do servidor (exposto para testes). */
  bouncePlayers(a: PlayerState, b: PlayerState): [boolean, boolean] {
    return executePlayerBounce(this.physicsContext(), a, b, this.callbacks());
  }
}

/** `WorldSettings::getRespawnTime`: [tempo base, tempo extra] em segundos. */
export function respawnTime(settings: GameSettings, playerTeamSize: number, enemyTeamSize: number): [number, number] {
  const w = settings.world;
  let extra = w.extraRespawnTimeAlone;
  if (playerTeamSize > enemyTeamSize && enemyTeamSize !== 0) extra += (w.respawnBalancingTime * (playerTeamSize - enemyTeamSize)) / enemyTeamSize;
  return [w.respawnTime, extra];
}

/** `doRegenerate` (src/world.cpp:3076): sobe `v` de `startLimit` até `limit`; devolve se gastou todo o tempo. */
function doRegenerate(v: { v: number }, startLimit: number, limit: number, speed: number, left: { t: number }): boolean {
  if (v.v < startLimit || v.v >= limit || speed === 0) return false;
  v.v += speed * left.t;
  if (v.v <= limit) return true;
  left.t = (v.v - limit) / speed;
  v.v = limit;
  return false;
}

function addKill(pl: PlayerState, deathbringer: boolean): void {
  const s = pl.stats;
  s.kills++;
  if (++s.curConsKills > s.consKills) s.consKills = s.curConsKills;
  s.curConsDeaths = 0;
  if (deathbringer) s.dbKills++;
}

function addDeath(pl: PlayerState, deathbringer: boolean, time: number): void {
  const s = pl.stats;
  s.deaths++;
  if (++s.curConsDeaths > s.consDeaths) s.consDeaths = s.curConsDeaths;
  s.curConsKills = 0;
  if (deathbringer) s.dbDeaths++;
  statsKill(pl, time);
}

/** `Statistics::add_flag_take`. */
function addFlagTake(s: PlayerStats, time: number, type: CarriedFlag): void {
  s.carriedFlag = type;
  s.flagsTaken++;
  s.flagTakeTime = time;
}

/** `Statistics::add_flag_drop`: entregar numa captura não conta como largada. */
function addFlagDrop(s: PlayerStats, time: number, countAsDrop: boolean): void {
  s.carriedFlag = CarriedFlag.None;
  if (countAsDrop) s.flagsDropped++;
  s.flagCarryingTime += time - s.flagTakeTime;
}

/** `Statistics::add_capture`. */
function addCapture(s: PlayerStats, time: number): void {
  s.carriedFlag = CarriedFlag.None;
  s.captures++;
  s.flagCarryingTime += time - s.flagTakeTime;
}

/** `Statistics::kill`: encerra a vida atual (no-op se já estava morto). */
function statsKill(pl: PlayerState, time: number): void {
  if (pl.stats.dead) return;
  pl.stats.dead = true;
  pl.stats.lifetime += time - pl.stats.spawnTime;
}
