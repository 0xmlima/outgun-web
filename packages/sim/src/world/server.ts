// SPDX-License-Identifier: GPL-2.0-or-later
// Lógica de servidor do frame (`ServerWorld`, src/world.cpp:1228-3365): tiro e foguetes (OG-022),
// colisões especiais entre jogadores (OG-023), vida, energia, dano e morte (OG-024). As partes de
// outros cards (power-ups, deathbringer, bandeiras, respawn) lançam `NotPortedError` se forem
// exercitadas, para que a falta apareça nos testes de paridade em vez de passar despercebida.
import type { GameSettings } from '@outgun/settings';
import { N_PI_2, PLAYER_RADIUS, POWERUP_RADIUS, ROCKET_RADIUS, SHOT_DELTA_X } from '../constants.js';
import { Vec } from '../geometry/vec.js';
import { iround, iroundBound, sqr } from '../math.js';
import { randomShuffle, type Rng } from '../rng.js';
import { adjustGunDirection, gunDirectionToRad, isRun } from './controls.js';
import { applyPhysics, executePlayerBounce, type PhysicsCallbacks, type PhysicsContext, type PlayerHitResult } from './physics.js';
import { CarriedFlag, Position, type FlagState, type PlayerState, type RocketState, type WorldState } from './state.js';

/** Alpha do jogador com shadow quando é revelado (atirou, foi atingido...). */
export const MAXIMUM_SHADOW_VISIBILITY = 254;

export const DamageType = { rocket: 0, deathbringer: 1, collision: 2 } as const;
export type DamageType = (typeof DamageType)[keyof typeof DamageType];

export class NotPortedError extends Error {
  constructor(what: string, card: string) {
    super(`${what}: ainda não portado (${card})`);
  }
}

/** Efeitos de pontuação para fora da sim (ranking, OG-084) e eventos para a rede/áudio. */
export interface ServerHooks {
  /** Frag positivo ou negativo (`Server::score_frag`); a sim já soma em `stats.frags`. */
  scoreFrag?(pid: number, amount: number): void;
  /** Ponto negativo do ranking (`Server::score_neg`). */
  scoreNeg?(pid: number, amount: number): void;
}

/** Formações de tiro por nível de arma (src/world.cpp:1380): foguetes à frente e desvios em oitavos. */
const FORMATIONS: readonly { forward: 1 | 2 | 3; directions: readonly number[] }[] = [
  { forward: 1, directions: [] },
  { forward: 2, directions: [] },
  { forward: 3, directions: [] },
  { forward: 2, directions: [-1, 1] },
  { forward: 3, directions: [-2, 2] },
  { forward: 2, directions: [-1, 1, -2, 2] },
  { forward: 3, directions: [-2, 2, -3, 3] },
  { forward: 2, directions: [-1, 1, -2, 2, -3, 3] },
  { forward: 3, directions: [-1, 1, -2, 2, -3, 3] },
];

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

  /** `WorldBase::addRocket`: cria o foguete já avançado 15 px (não acerta quem está colado). */
  private addRocket(rid: number, owner: number, team: number, pos: Position, power: boolean, dir: number, xdelta: number, frameAdvance: number, cb: PhysicsCallbacks): void {
    const r = this.world.rockets[rid] as RocketState;
    r.owner = owner;
    r.team = team;
    r.power = power;
    r.pos = pos.clone();
    r.direction = dir;
    const deg = gunDirectionToRad(dir);
    const room = this.world.map.room({ x: r.pos.roomX, y: r.pos.roomY });
    const physics = this.settings.physics;

    if (xdelta) {
      // foguetes paralelos: primeiro desloca para o lado
      r.vel = new Vec(Math.cos(deg + N_PI_2), Math.sin(deg + N_PI_2)).mul(xdelta * SHOT_DELTA_X);
      const wallTime = room.timeTillWall(r.pos.local(), r.vel, ROCKET_RADIUS, 1.01).time;
      r.pos.move(r.vel, 1);
      if (wallTime < 1) {
        cb.rocketHitWall(rid, r.power);
        return;
      }
    }
    r.vel = new Vec(Math.cos(deg), Math.sin(deg)).mul(physics.rocketSpeed);
    const advance = 15 / physics.rocketSpeed + frameAdvance;
    const wallTime = room.timeTillWall(r.pos.local(), r.vel, ROCKET_RADIUS, advance * 1.01).time;
    if (wallTime <= advance) {
      r.pos.move(r.vel, wallTime);
      cb.rocketHitWall(rid, r.power);
      return;
    }
    r.pos.move(r.vel, advance);
    if (r.pos.isOutOfBounds()) cb.rocketOutOfBounds(rid);
  }

  /** `ServerWorld::shootRockets` + `WorldBase::shootRockets`. */
  shootRockets(pl: PlayerState, shots: number): void {
    const pos = new Position(pl.pos.roomX, pl.pos.roomY, Math.trunc(pl.pos.x), Math.trunc(pl.pos.y)); // como o cliente recebe
    pl.stats.shots++;
    this.world.teams[this.teamOf(pl.pid)].shots++;
    const rids: number[] = [];
    for (let i = 0; i < shots; i++) rids.push(this.getFreeRocket());
    const cb = this.callbacks();
    const team = this.teamOf(pl.pid);
    const dir = pl.attackGunDir;
    const form = FORMATIONS[shots - 1];
    if (!form) throw new Error(`nível de arma inválido: ${shots}`);
    const add = (index: number, direction: number, xdelta: number) =>
      this.addRocket(rids[index] as number, pl.pid, team, pos, pl.power, direction, xdelta, 0, cb);
    if (form.forward === 1) add(0, dir, 0);
    else if (form.forward === 2) {
      add(0, dir, -1);
      add(1, dir, 1);
    } else {
      add(0, dir, 0);
      add(1, dir, -2);
      add(2, dir, 2);
    }
    for (let ri = form.forward; ri < shots; ri++) add(ri, adjustGunDirection(dir, form.directions[ri - form.forward] as number), 0);
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
      if (pups.pupShieldHits) {
        t.shield--;
      } else {
        t.energy -= damage;
        if (t.energy <= 0) {
          t.energy = 0;
          t.shield = 0;
        }
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
    this.killPlayer(target, false);
  }

  /** `ServerWorld::killPlayer`. */
  killPlayer(target: number, timePenalty: boolean): void {
    const t = this.player(target);
    this.scoreNeg(target, 1);
    if (this.dropFlagIfAny(target)) this.scoreNeg(target, 1);
    if (t.deathbringer) throw new NotPortedError('explosão de deathbringer', 'OG-026');
    if (this.settings.powerups.pupsDropAtDeath) throw new NotPortedError('power-up largado na morte', 'OG-025');
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

  /** `dropFlagIfAny`: no S3 só há suporte a quem não carrega bandeira. */
  dropFlagIfAny(pid: number): boolean {
    if (this.player(pid).stats.carriedFlag === CarriedFlag.None) return false;
    throw new NotPortedError('largar bandeira', 'OG-027');
  }

  /** `ServerWorld::rocketHitPlayerCallback`: dano, estatísticas, empurrão e remoção do foguete. */
  rocketHitPlayer(rid: number, pid: number): boolean {
    const rk = this.world.rockets[rid] as RocketState;
    const pl = this.player(pid);
    const physics = this.settings.physics;
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
      } else if (pl2.deathbringer && !pl1.deathbringer) {
        pl1.deathbringerEnd = time + deathbringerEffectTime;
        pl1.nextShootFrame = this.frame + iround(deathbringerEffectTime * 10);
        pl1.deathbringerAttacker = pid2;
        tossA = true;
        tossB = true;
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

  // ---------------------------------------------------------------- etapas do frame

  /** `simulatePlayerPrePhysics` (sem o anti-flood do chat, que fica no servidor de salas). */
  prePhysics(pl: PlayerState): void {
    const time = this.time;
    if (pl.turbo && time > pl.turboTime) pl.turbo = false;
    if (pl.power && time > pl.powerTime) pl.power = false;
    if (pl.hasShadow() && time > pl.shadowTime) pl.visibility = 255;
    if (pl.hasShadow()) pl.visibility = Math.max(this.settings.world.shadowMinimum, pl.visibility - 10);
    if (pl.deathbringerEnd > time && !pl.dead) this.damagePlayer(pl.pid, pl.deathbringerAttacker, pl.shield ? 12 : 3, DamageType.deathbringer);
  }

  /** `simulatePlayerPostPhysics`: tiro, vida e energia; power-ups e bandeiras ainda pendentes. */
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

    if (!pl.underDeathbringerEffect(this.time) && this.touchesPowerup(pl)) throw new NotPortedError('pegar power-up', 'OG-025');

    if (pl.health > w.healthMax) pl.health = w.healthMax;
    if (pl.energy < 0) pl.energy = 0;
    else if (pl.energy > w.energyMax) pl.energy = w.energyMax;

    if (pl.underDeathbringerEffect(this.time)) return;
    if (this.flagInteractionPossible(pl)) throw new NotPortedError('bandeiras (pegar, devolver, capturar)', 'OG-027');
  }

  /** Power-ups no chão são conhecidos só pelo adaptador no S3; ver OG-025. */
  powerupPositions: Position[] = [];

  private touchesPowerup(pl: PlayerState): boolean {
    const r2 = sqr(POWERUP_RADIUS + PLAYER_RADIUS);
    return this.powerupPositions.some((pos) => this.sameRoom(pos, pl.pos) && pos.local().sub(pl.pos.local()).mag2() < r2);
  }

  /** Haveria alguma interação de bandeira neste frame? (detecção para o S3; lógica no OG-027) */
  private flagInteractionPossible(pl: PlayerState): boolean {
    const r2 = sqr(PLAYER_RADIUS + 15);
    const touching = (f: FlagState) => {
      const pos = f.status === 'carried' ? this.player(f.carrier).pos : f.pos;
      return this.sameRoom(pos, pl.pos) && pos.local().sub(pl.pos.local()).mag2() < r2;
    };
    const own = this.world.teams[pl.team].flags;
    const enemy = this.world.teams[1 - pl.team as 0 | 1].flags;
    if (pl.stats.carriedFlag !== CarriedFlag.None) return true;
    if (enemy.some((f) => f.status !== 'carried' && touching(f))) return true;
    if (this.world.wildFlags.some((f) => f.status !== 'carried' && touching(f))) return true;
    return own.some((f) => f.status === 'dropped' && touching(f));
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
    // (-1) reaparecimento de power-ups: OG-025 (consome rand(), mas nada depois dele nesta etapa)
    for (const pl of order) this.prePhysics(pl);
    if (this.deathbringerExplosions > 0) throw new NotPortedError('explosões de deathbringer', 'OG-026');
    applyPhysics(this.physicsContext(), this.callbacks(), PLAYER_RADIUS, 1);
    this.respawnCountdown(order);
    for (const pl of order) this.postPhysics(pl);
    if (this.settings.world.carryingScoreTime > 0 && world.wildFlags.some((f) => f.status === 'carried')) {
      throw new NotPortedError('pontos por posse de bandeira selvagem', 'OG-027');
    }
    // limites de tempo e fim de partida: OG-029
  }

  /** Explosões de deathbringer ativas (estado completo no OG-026). */
  deathbringerExplosions = 0;

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

  respawnPlayer(pid: number): void {
    throw new NotPortedError(`respawn do jogador ${pid}`, 'OG-029');
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
      playerScreenChange: () => {},
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

/** `Statistics::kill`: encerra a vida atual (no-op se já estava morto). */
function statsKill(pl: PlayerState, time: number): void {
  if (pl.stats.dead) return;
  pl.stats.dead = true;
  pl.stats.lifetime += time - pl.stats.spawnTime;
}
