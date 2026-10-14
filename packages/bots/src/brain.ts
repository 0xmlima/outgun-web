// SPDX-License-Identifier: GPL-2.0-or-later
// Decisões dos bots (OG-053): bandeiras, power-ups, escolha de destino e o laço principal
// (src/robot.cpp:797-975, 976-995, 1160-1905).
import {
  FLAG_RADIUS,
  N_PI,
  N_PI_2,
  N_PI_4,
  PLAYER_RADIUS,
  POWERUP_RADIUS,
  Vec,
  adjustGunDirection,
  controlDirection,
  dot,
  positiveFmod,
  type FlagState,
  type Position,
  type Rng,
  type WorldCoords,
} from '@outgun/sim';
import type { Area, AreaMap } from './areamap.js';
import {
  aim,
  escapeExplosion,
  escapeRocket,
  getDangerousEnemy,
  getDangerousRocket,
  getEasyEnemy,
  getNearestEnemy,
  isMassive,
  needShootFreeTurning,
  needShootTradTurning,
} from './combat.js';
import { DistanceTableId, ROOM_TO_ROOM_BASE_DISTANCE } from './distance.js';
import { freeWalk, moveTo, moveToDestination, moveToDoor, moveToNoAggregate, setDestination } from './navigation.js';
import { AlreadyInRoom, Ctl, DestinationType, FADEOUT, RobotCore, S_H, S_W, controlsFromDirection, to8way } from './robot-core.js';
import {
  amILast,
  basesOf,
  dangerousExplosionInNeighbor,
  enemyHasUnseenFlags,
  getPlayers,
  isAnyFlagAtBase,
  isFlagAtBase,
  isHome,
  moreDefensive,
  teamHasFlags,
  teams,
} from './situation.js';
import type { BotPlayer, BotView } from './view.js';

const R2R = ROOM_TO_ROOM_BASE_DISTANCE;
const other = (team: number): 0 | 1 => (team === 0 ? 1 : 0);

/** Resultado de uma decisão: controles do frame e o botão de tiro. */
export interface BotDecision {
  controls: number;
  fire: boolean;
}

/** Bot completo: o `Robot` do original menos a conexão (o cliente virtual fica no servidor). */
export class Robot extends RobotCore {
  constructor(view: BotView, areaMap: AreaMap, me: number, rng: Rng) {
    super(view, areaMap, me, rng);
    this.buildMap();
  }

  /** Mapa novo (`BuildMap`): esquece o que sabia do mapa anterior. */
  buildMap(): void {
    this.enemiesInRoom = false;
    this.lastSeen = -1;
    this.myGundir = -1;
    this.fx.enemiesSeenFrame.fill(0);
    this.tables.reset();
    this.destinationType = DestinationType.None;
    this.destination = null;
    this.immediateDestination = null;
    this.freeWalkTarget.x = -1;
  }

  // --- bandeiras e power-ups ---------------------------------------------------------------

  /** Power-up na minha área (`GetPowerup`). */
  getPowerup(onImportantMission: boolean): number {
    const me = this.player(this.me);
    for (const item of this.fx.world.items) {
      if (!item.isReal() || this.areaOf(item.pos) !== this.myArea()) continue;
      const d = item.pos.local().sub(this.myPos.local());
      if (onImportantMission) {
        if (this.isBehindWall(d, PLAYER_RADIUS, PLAYER_RADIUS + POWERUP_RADIUS)) continue;
        // não volta para pegar o que ficou para trás
        if (dot(d, me.vel) < 0 && d.mag2() > (5 * PLAYER_RADIUS) ** 2) continue;
      }
      return moveTo(this, d, PLAYER_RADIUS + POWERUP_RADIUS);
    }
    return 0;
  }

  /** Levando bandeira: ir até onde dá para capturar na minha área (`captureOnFlag`). */
  captureOnFlag(carried: boolean): number {
    const myFlag = this.haveFlag(this.me);
    const rules = this.fx.rules;
    const myTeam = this.myTeam();
    for (let type = 0; type <= 2; ++type) {
      const team = type === 0 ? myTeam : type === 1 ? 2 : other(myTeam);
      const captureOnOtherFlag = (type === 0 && rules.captureOnTeamFlags && myFlag !== 3) || (type === 1 && rules.captureOnWildFlags);
      const captureOnMyFlag = (myFlag === 3 && rules.captureOnTeamFlags && type !== 0) || (myFlag === 2 && rules.captureOnWildFlags);
      if (!captureOnOtherFlag && !captureOnMyFlag) continue;
      for (const f of this.fx.world.flagsOf(team)) {
        const fCarried = f.status === 'carried';
        if (fCarried !== carried || (fCarried && (f.carrier === this.me || !this.isMyTeam(this.player(f.carrier))))) continue;
        const pos = fCarried ? this.player(f.carrier).pos : f.pos;
        if (this.areaOf(pos) !== this.myArea()) continue;
        // capturar, ou devolver a própria para poder capturar; selvagens não se devolvem
        if ((!rules.carryOwnTeamFlag && type === 0) || rules.captureAwayFromBase || isFlagAtBase(this, f, team, true)) {
          const lPos = fCarried ? this.predictPlayer(this.player(f.carrier)) : pos.local();
          return moveTo(this, lPos.sub(this.myPos.local()), PLAYER_RADIUS + FLAG_RADIUS);
        }
        if (!rules.captureAwayFromBase && carried) {
          for (let baseType = 0; baseType <= 1; ++baseType) {
            const baseTeam = baseType === 0 ? myTeam : 2;
            if (
              (baseType === 0 && !((type === 0 && captureOnOtherFlag) || (myFlag === 3 && captureOnMyFlag))) ||
              (baseType === 1 && !((type === 1 && captureOnOtherFlag) || (myFlag === 2 && captureOnMyFlag)))
            ) {
              continue;
            }
            for (const base of basesOf(this, baseTeam)) {
              if (this.areaMap.identifyArea(base) === this.myArea()) {
                return moveTo(this, new Vec(base.x, base.y).sub(this.myPos.local()), PLAYER_RADIUS + FLAG_RADIUS);
              }
            }
          }
        }
      }
    }
    return 0;
  }

  /** Sem bandeira: pegar uma na minha área (ou devolver a nossa) (`pickUpFlag`). */
  pickUpFlag(): number {
    const rules = this.fx.rules;
    for (let type = 0; type < 3; ++type) {
      // 0: nossas, 1: inimigas, 2: selvagens
      if (type === 2 ? rules.lockWildFlags : rules.lockTeamFlags) continue;
      const team = type === 0 ? this.myTeam() : type === 1 ? other(this.myTeam()) : 2;
      for (const f of this.fx.world.flagsOf(team)) {
        if (this.areaOf(f.pos) !== this.myArea() || f.status === 'carried') continue;
        if (!(type === 0 && !rules.carryOwnTeamFlag && isFlagAtBase(this, f, team, false))) {
          return moveTo(this, f.pos.local().sub(this.myPos.local()), PLAYER_RADIUS + FLAG_RADIUS);
        }
      }
    }
    return 0;
  }

  getFlag(): number {
    if (this.haveFlag(this.me)) {
      const ctrl = this.captureOnFlag(false);
      return ctrl !== 0 ? ctrl : this.captureOnFlag(true);
    }
    return this.pickUpFlag();
  }

  /** Com bandeira e cercado: ir para a área vizinha com amigos (`Escape`). */
  escape(): number {
    if (!this.haveFlag(this.me)) return 0;
    const a = this.myArea();
    const tc = teams(this, a, true);
    if (tc.enemies <= tc.friends) return 0;
    for (const ni of a.neighbors) {
      const ntc = teams(this, ni.area, false);
      if (ntc.friends + 1 > ntc.enemies && ntc.friends > 0) {
        // não olha outros vizinhos: é para este que iremos quando a explosão passar (logo)
        if (dangerousExplosionInNeighbor(this, ni)) return 0;
        return moveToDoor(this, ni);
      }
    }
    return 0;
  }

  /** Escolta um companheiro com bandeira, um pouco à frente dele (`FollowFlag`). */
  followFlag(): number {
    let d = new Vec(0, 0);
    let s = new Vec(0, 0);
    let num = 0;
    for (const pl of this.fx.players) {
      if (!pl.used || !this.isMyTeam(pl) || pl.dead || pl.pid === this.me || !this.haveFlag(pl.pid) || !this.here(pl)) continue;
      d = d.add(pl.pos.local());
      s = s.add(pl.vel);
      num++;
    }
    if (!num || isHome(this, this.myArea())) return 0;
    d = d.add(s.mul(this.averageLag)).div(num).sub(this.myPos.local());
    let target = d;
    const sMag = s.mag();
    if (sMag) {
      // inércia: soma 4 frames de velocidade; e lidera o portador por uma distância fixa
      const timeAdvance = 4;
      target = target.add(s.sub(this.player(this.me).vel).mul(timeAdvance));
      target = target.add(s.mul((5 * PLAYER_RADIUS) / sMag));
    }
    // "não faça nada" em vez de "tanto faz"
    if (target.mag() < 3 * PLAYER_RADIUS) return Ctl.strafe;
    if (!this.isBehindWall(target, PLAYER_RADIUS, 0)) return moveToNoAggregate(this, target, PLAYER_RADIUS);
    return moveToNoAggregate(this, d, PLAYER_RADIUS);
  }

  // --- escolha de destino --------------------------------------------------------------------

  /** A bandeira já tem defensores suficientes? Deixa para os outros (`flagIgnored`). */
  flagIgnored(flag: FlagState, base: WorldCoords | undefined, team: number): boolean {
    if (this.haveFlag(this.me)) return false;
    const fx = this.fx;
    const carried = flag.status === 'carried';
    let atBase: boolean;
    // base ausente: só com bandeiras a mais que bases (o original lê fora do vetor)
    if (carried || !base || flag.pos.roomX !== base.room.x || flag.pos.roomY !== base.room.y) atBase = false;
    else atBase = Math.abs(base.x - flag.pos.x) <= 5 && Math.abs(base.y - flag.pos.y) <= 5;

    const myTeam = this.myTeam();
    const limitInterest = (atBase && team === myTeam) || (carried && this.isMyTeam(this.player(flag.carrier)));
    // bandeira inimiga largada, que o inimigo pode devolver
    const droppedEnemyFlag = !atBase && !carried && team === other(myTeam) && !fx.rules.carryOwnTeamFlag;
    if ((!limitInterest && !droppedEnemyFlag) || (carried && this.player(flag.carrier).posUpdated < fx.frame - FADEOUT)) return false;

    const pos = carried ? this.player(flag.carrier).pos : flag.pos;
    this.buildDistanceTable(this.areaOf(pos), 0, DistanceTableId.Def);
    const myDistance = this.distance(DistanceTableId.Def, this.myArea());
    const inMap = (p: BotPlayer): boolean => p.pos.roomX < fx.map.width && p.pos.roomY < fx.map.height;

    if (droppedEnemyFlag) {
      if (myDistance < 2 * R2R) return false;
      let nearEnemyDistance = myDistance;
      let nearFriendDistance = myDistance;
      for (const player of fx.players) {
        if (!player.used || player.dead || player.pid === this.me || !inMap(player) || player.posUpdated < fx.frame - FADEOUT) continue;
        const distance = this.distance(DistanceTableId.Def, this.areaOf(player.pos));
        if (this.isMyTeam(player)) nearFriendDistance = Math.min(nearFriendDistance, distance);
        else nearEnemyDistance = Math.min(nearEnemyDistance, distance);
      }
      return nearFriendDistance >= 2 * R2R && nearEnemyDistance < nearFriendDistance - Math.trunc((R2R * 3) / 2);
    }

    const nAllFlags = fx.bases[0].length + fx.bases[1].length + fx.bases[2].length;
    const maxPlayers = carried ? Math.trunc(getPlayers(this, myTeam) / 2) : Math.trunc(getPlayers(this, myTeam) / nAllFlags);
    if (maxPlayers === 0) return true;
    let nearNum = 0;
    for (const player of fx.players) {
      if (!player.used || !this.isMyTeam(player) || player.dead || player.pid === this.me || !inMap(player)) continue;
      const distance = this.distance(DistanceTableId.Def, this.areaOf(player.pos));
      if (distance < myDistance || (distance === myDistance && moreDefensive(this, player))) {
        if (++nearNum >= maxPlayers) return true;
      }
    }
    return false;
  }

  private targetNearestBase(best: { distance: number; area: Area | null }, team: number): void {
    for (const base of basesOf(this, team)) {
      const a = this.areaMap.identifyArea(base);
      const distance = this.distance(DistanceTableId.Main, a);
      if (distance === -1) continue;
      if (distance < best.distance || best.distance === -1) {
        best.distance = distance;
        best.area = a;
        this.destinationType = DestinationType.Base;
      }
    }
  }

  private targetNearestTeam(best: { distance: number; area: Area | null }, team: number): void {
    const fx = this.fx;
    const enemy = this.myTeam() !== team;
    for (const pl of fx.players) {
      if (pl.pid === this.me || !pl.used || pl.team !== team || pl.dead || pl.pos.roomX >= fx.map.width || pl.pos.roomY >= fx.map.height) continue;
      if (enemy) {
        if (fx.frame - pl.posUpdated > FADEOUT) continue;
        if (fx.enemiesSeen(pl.pos.roomX, pl.pos.roomY) > pl.posUpdated) continue;
      }
      const a = this.areaOf(pl.pos);
      const distance = this.distance(DistanceTableId.Main, a);
      if (distance === -1) continue;
      if (distance < best.distance || best.distance === -1) {
        best.distance = distance;
        best.area = a;
        this.destinationType = DestinationType.Team;
      }
    }
  }

  /** state: 0 na base, 1 largada fora da base, 2 com amigo, 3 com inimigo (`TargetNearestFlag`). */
  private targetNearestFlag(best: { distance: number; area: Area | null }, team: number, state: number): void {
    const fx = this.fx;
    const wantCarried = state === 2 || state === 3;
    const carrierTeam = state === 2 ? this.myTeam() : other(this.myTeam());
    fx.world.flagsOf(team).forEach((f, index) => {
      if ((f.status === 'carried') !== wantCarried || this.flagsIgnored[team]![index]) return;
      let pos: Position;
      if (f.status === 'carried') {
        const pl = this.player(f.carrier);
        if (pl.team !== carrierTeam || !pl.used || pl.pid === this.me || pl.pos.roomX >= fx.map.width || pl.pos.roomY >= fx.map.height) return;
        if (state === 3 && !pl.onscreen) {
          // posição recente o bastante?
          if (fx.frame - pl.posUpdated > FADEOUT) return;
          if (fx.enemiesSeen(pl.pos.roomX, pl.pos.roomY) > pl.posUpdated) return;
        }
        pos = pl.pos;
      } else {
        if (isFlagAtBase(this, f, team, true) !== (state === 0)) return;
        pos = f.pos;
      }
      const a = this.areaOf(pos);
      let distance = this.distance(DistanceTableId.Main, a);
      if (distance === -1) return;
      // bandeira do time largada perto: prioridade, se dá para devolvê-la
      if (state === 1 && team !== 2 && distance <= Math.trunc((R2R * 3) / 2) && !fx.rules.carryOwnTeamFlag) distance = 0;
      if (distance < best.distance || best.distance === -1) {
        best.distance = distance;
        best.area = a;
        this.destinationType = DestinationType.Flag;
      }
    });
  }

  /** Sala vizinha vista há mais tempo (`TargetFog`). */
  private targetFog(): void {
    const here = this.myArea();
    let maxDelta = 0;
    let target: Area | null = null;
    for (const ni of here.neighbors) {
      const na = ni.area;
      if (this.destinationType === DestinationType.Base && this.distance(DistanceTableId.Destination, na) > 3 * R2R) continue;
      const tc = teams(this, na, false);
      if (tc.friends && !tc.enemies) continue; // setor nosso
      const delta = Math.abs(this.fx.frame - this.fx.enemiesSeen(na.room.x, na.room.y));
      if (delta >= maxDelta) {
        maxDelta = delta;
        target = na;
      }
    }
    if (!target) return;
    this.destinationType = DestinationType.Fog;
    setDestination(this, target);
  }

  /**
   * Primeiro alvo de menor distância entre as opções ligadas (`TargetNearest`): bandeira
   * inimiga/nossa/selvagem {na base, largada, com inimigo, com amigo}, time {inimigo, nosso} e base
   * {inimiga, nossa, selvagem}.
   */
  private targetNearest(o: readonly (boolean | number)[]): void {
    const best = { distance: -1, area: null as Area | null };
    const t = this.myTeam();
    const et = other(t);
    this.buildDistanceTable(this.myArea(), this.myRespawnWeight(), DistanceTableId.Main);
    this.destinationType = DestinationType.None;
    const flagCalls: [number, number][] = [
      [et, 0], [et, 1], [et, 3], [et, 2],
      [t, 0], [t, 1], [t, 3], [t, 2],
      [2, 0], [2, 1], [2, 3], [2, 2],
    ]; // prettier-ignore
    flagCalls.forEach(([team, state], i) => {
      if (o[i]) this.targetNearestFlag(best, team, state);
    });
    if (o[12]) this.targetNearestTeam(best, et);
    if (o[13]) this.targetNearestTeam(best, t);
    if (o[14]) this.targetNearestBase(best, et);
    if (o[15]) this.targetNearestBase(best, t);
    if (o[16]) this.targetNearestBase(best, 2);
    if (this.destinationType === DestinationType.None) return;
    if (!best.area) throw new Error('targetNearest: destino sem área');
    setDestination(this, best.area);
  }

  /** Lê o tipo de destino sem o estreitamento do TypeScript (os `target*` o mudam). */
  private dest(): DestinationType {
    return this.destinationType;
  }

  /** Para onde ir (`ChooseDestination`). */
  chooseDestination(): void {
    const flag = this.haveFlag(this.me);
    const rules = this.fx.rules;
    this.destinationType = DestinationType.None;
    if (!flag) {
      const sef = !rules.lockTeamFlags; // roubar bandeiras inimigas?
      const swf = !rules.lockWildFlags; // roubar selvagens?
      const deb = (enemyHasUnseenFlags(this, true) || enemyHasUnseenFlags(this, false)) && rules.captureOnTeamFlags;
      // qualquer bandeira que faça sentido, ou a base inimiga se eles têm uma bandeira não vista
      this.targetNearest([sef, sef, 1, 1, sef, 1, 1, 1, swf, swf, 1, 1, 0, 0, deb, 0, 0]);
      if (this.dest() === DestinationType.None) {
        // na falta de coisa melhor, para de ignorar alvos já cheios
        for (const ignored of this.flagsIgnored) ignored.fill(false);
        // só defende bandeiras já defendidas se o time pode capturar com as que controla
        const controlOwn = teamHasFlags(this, this.myTeam(), this.myTeam()) || isAnyFlagAtBase(this, this.myTeam());
        const controlOpp = teamHasFlags(this, this.myTeam(), other(this.myTeam()));
        const controlWild = teamHasFlags(this, this.myTeam(), 2);
        let def = false;
        if (rules.captureOnTeamFlags && controlOwn && (controlOpp || controlWild)) def = true;
        if (rules.captureOnWildFlags && controlOpp && (controlWild || rules.lockWildFlags)) def = true;
        if (!rules.captureOnWildFlags && !rules.captureOnTeamFlags) def = true;
        // idem com os ignorados liberados, ou uma base vazia (a bandeira deve voltar logo)
        this.targetNearest([sef, sef, 1, def, sef && def, 1, 1, def, swf, swf, 1, def, 0, 0, sef, 0, swf]);
      }
      if (this.dest() === DestinationType.None) {
        this.targetNearest([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]); // senão, um inimigo
      }
      if (this.dest() === DestinationType.None || this.dest() === DestinationType.Base) {
        if (this.dest() === DestinationType.Base) {
           
          const tc = teams(this, this.destination!, true);
          // indo para uma base onde já há forças nossas: esquece
          if (tc.friends > tc.enemies) {
            if (this.destination !== this.myArea() || (tc.enemies === 0 && amILast(this))) this.targetFog();
          }
        } else this.targetFog();
      }
    } else {
      // levando bandeira
      const ctf = rules.captureOnTeamFlags;
      const cwfe = rules.captureOnWildFlags;
      const away = rules.captureAwayFromBase;
      const cwf = (flag !== 3 && cwfe) || (flag === 3 && ctf && away); // capturar (ou ao contrário) na selvagem?
      const cof = flag !== 3 && ctf; // capturar na nossa?
      const cmwf = away && cwf; // na selvagem fora da base?
      const cmof = away && cof; // na nossa fora da base?
      const cef = away && ((flag === 3 && ctf) || (flag === 2 && cwfe)); // (ao contrário) na inimiga?
      if (getPlayers(this, this.myTeam()) > 1) {
        this.targetNearest([cef, cef, 0, cef, cof, cmof, 0, cmof, cwf, cmwf, 0, cmwf, 0, 0, 0, 0, 0]); // ponto de captura disponível
      } else {
        // ponto de captura, ou a nossa bandeira largada
        this.targetNearest([cef, cef, 0, 0, cof, 1, 0, 0, cwf, cmwf, 0, 0, 0, 0, 0, 0, 0]);
      }
      if (this.dest() === DestinationType.None) {
        this.targetNearest([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ctf, 0]); // a base, mesmo indisponível
      }
      if (this.dest() === DestinationType.None) {
        this.targetNearest([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, cwf]); // esperar numa base selvagem vazia
      }
    }
  }

  /** Em missão (sem agressividade)? (`IsMission`) */
  isMission(): boolean {
    const toHome = isHome(this, this.destination);
    if (this.destination === this.myArea()) return false;
    return !!this.haveFlag(this.me) || this.destinationType === DestinationType.Flag || toHome || (!toHome && this.destinationType === DestinationType.Base);
  }

  /** Inimigo sumido: adivinha para onde foi, ou esquece (`updateUnknownPosition`). */
  updateUnknownPosition(pl: BotPlayer): void {
    const fx = this.fx;
    if (pl.posUpdated < fx.frame - FADEOUT) return; // não importa mais
    if (pl.posUpdated >= fx.enemiesSeen(pl.pos.roomX, pl.pos.roomY)) return; // pode estar lá ainda
    const a = this.areaOf(pl.pos);
    let guess: { roomX: number; roomY: number; x: number; y: number } | null = null;
    let timeGuess = 0;
    for (const ni of a.neighbors) {
      let doorPos: Vec;
      try {
        doorPos = this.nearestDoor(ni, pl.pos.local());
      } catch (e) {
        if (e instanceof AlreadyInRoom) throw new Error('updateUnknownPosition: posição fora da sala', { cause: e });
        throw e;
      }
      const doorDist = doorPos.sub(pl.pos.local()).mag();
      const earliestTimeThere = pl.posUpdated + Math.ceil(doorDist / fx.physics.maxRunSpeed);
      if (earliestTimeThere > fx.frame) continue;
      const n = ni.area;
      const nSeen = fx.enemiesSeen(n.room.x, n.room.y);
      // podia ter entrado e saído antes de nSeen, mas isso é difícil de acompanhar
      if (nSeen >= fx.frame - 10) continue;
      if (guess) return; // vários vizinhos possíveis: não arrisca
      guess = { roomX: n.room.x, roomY: n.room.y, x: doorPos.x - ni.dx * S_W, y: doorPos.y - ni.dy * S_H };
      timeGuess = Math.max(nSeen + 10, earliestTimeThere);
    }
    if (guess) pl.setPosition(guess.roomX, guess.roomY, guess.x, guess.y, timeGuess);
    else pl.posUpdated = fx.frame - FADEOUT; // "esquece" a posição
  }

  /** As decisões de um frame (`getRobotControls`). */
  getRobotControls(): number {
    const fx = this.fx;
    const me = this.player(this.me);
    fx.setEnemiesSeen(me.pos.roomX, me.pos.roomY, fx.frame);
    if (me.shadowTime > fx.frame / 10) {
      // estima no máximo 10 frames para mandar a posição de todos (supõe shadow há 10 frames)
      for (let i = 0; i < fx.enemiesSeenFrame.length; ++i) fx.enemiesSeenFrame[i] = Math.max(fx.enemiesSeenFrame[i]!, fx.frame - 10);
    }
    for (const p of fx.players) {
      if (!p.used || p.dead || !this.isMyTeam(p)) continue;
      if (
        p.posUpdated === fx.frame &&
        p.fromMinimapUpdate &&
        p.prevMapPosUpdateFrame >= p.posUpdated - 20 &&
        p.prevMapUpdateRoom.x === p.pos.roomX &&
        p.prevMapUpdateRoom.y === p.pos.roomY
      ) {
        // entre as duas atualizações do amigo teríamos sabido de inimigos na sala
        fx.setEnemiesSeen(p.pos.roomX, p.pos.roomY, Math.max(fx.enemiesSeen(p.pos.roomX, p.pos.roomY), p.prevMapPosUpdateFrame));
      }
    }
    let enemiesInRoomNow = false;
    for (const p of fx.players) {
      if (p.used && !p.dead && !this.isMyTeam(p)) {
        if (this.here(p, true)) enemiesInRoomNow = true;
        else this.updateUnknownPosition(p);
      }
    }
    if (!enemiesInRoomNow && this.enemiesInRoom) {
      // perdeu o último inimigo de vista: muda o passeio
      this.freeWalkTarget.x = -1;
      this.immediateDestination = null;
    }
    this.enemiesInRoom = enemiesInRoomNow;

    for (let team = 0; team <= 2; ++team) {
      const bases = basesOf(this, team);
      this.flagsIgnored[team] = fx.world.flagsOf(team).map((f, i) => this.flagIgnored(f, bases[i], team));
    }

    if (this.lastSeen !== -1) {
      const lsp = this.player(this.lastSeen);
      if (!lsp.used || this.isMyTeam(lsp) || lsp.dead || !this.here(lsp, true)) this.lastSeen = -1; // perdeu o alvo
    }

    if (!isMassive(this)) {
      const dangerousRocket = getDangerousRocket(this);
      if (dangerousRocket !== -1) {
        if (this.lastSeen === -1) this.lastSeen = getDangerousEnemy(this);
        return escapeRocket(this, dangerousRocket);
      }
    }
    let ctrl = escapeExplosion(this);
    if (ctrl !== 0) return ctrl;
    ctrl = this.getFlag();
    if (ctrl !== 0) return ctrl;

    this.chooseDestination();
    if (this.isMission()) this.lastSeen = getDangerousEnemy(this);
    else if (this.lastSeen !== -1) {
      const easy = getEasyEnemy(this);
      if (easy !== -1) this.lastSeen = easy;
    } else this.lastSeen = getNearestEnemy(this);

    const importantMission = !!this.haveFlag(this.me) && this.isMission();
    if (!importantMission && this.lastSeen !== -1 && !fx.physics.allowFreeTurning) return aim(this, this.lastSeen);

    ctrl = this.getPowerup(importantMission);
    if (ctrl !== 0) return ctrl;
    ctrl = this.escape();
    if (ctrl !== 0) return ctrl;
    ctrl = moveToDestination(this);
    if (ctrl !== 0) return ctrl;
    ctrl = this.followFlag();
    if (ctrl !== 0) return ctrl;
    ctrl = freeWalk(this);
    if (this.lastSeen === -1) ctrl &= ~Ctl.run;
    return ctrl;
  }

  /**
   * Um frame do bot (`RobotMain` + `clearModifiersIfIdle` de `bot_loop`). `controls` são os
   * controles já enviados e ainda não refletidos no mundo recebido, do mais antigo ao último
   * (`controlHistory[clFrameWorld + 1 .. clFrameSent]`), ou só o último se não há nenhum pendente.
   * `hidden`: mapa não carregado, placar de fim de jogo ou frame inválido.
   */
  decide(hidden: boolean, controls: readonly number[], pending: number): BotDecision {
    const fx = this.fx;
    for (const p of fx.players) if (p.dead) p.defending = p.defendingAfterDeath;
    const me = this.player(this.me);
    if (hidden || !me.used || me.dead || (me.team !== 0 && me.team !== 1) || me.pos.roomX >= fx.map.width || me.pos.roomY >= fx.map.height) {
      this.myGundir = -1;
      this.freeWalkTarget.x = -1;
      this.botPrevFire = false;
      return { controls: 0, fire: false };
    }

    this.futureMe = me.cloneBot();
    this.averageLag = pending + 0.5;
    this.extrapolate(this.futureMe, controls, pending ? 1.5 : 0.5);

    if (this.myGundir === -1) this.myGundir = to8way(me.gundir); // estava morto, ou algo assim
    let ctrl = this.getRobotControls();
    const currentGundir = this.myGundir;
    if (!(ctrl & Ctl.strafe) && controlDirection(ctrl) !== -1) this.myGundir = controlDirection(ctrl);

    let shoot: boolean;
    if (fx.physics.allowFreeTurning) {
      // sem alvo, mira para onde vai
      const [s, dir] = needShootFreeTurning(this, this.myGundir);
      shoot = s;
      const turnCeilingPerFrame = N_PI_2;
      const displacementMul = 0.7;
      const shootThreshold = N_PI / 8; // atira com a mira a até 22° do alvo
      const targetDiff = positiveFmod(dir * N_PI_4 - this.gunDir * N_PI_4 + N_PI, 2 * N_PI) - N_PI;
      let actualDiff = targetDiff;
      if (Math.abs(actualDiff) > turnCeilingPerFrame) actualDiff = turnCeilingPerFrame * (actualDiff > 0 ? 1 : -1);
      const modifier = ((this.rand() % 10001) - 5000) / 5000;
      // gira entre actualDiff × (1 ± 0,7), com os valores do meio mais prováveis
      actualDiff *= 1 + displacementMul * modifier * modifier * modifier;
      // o original soma radianos a uma direção medida em oitavos; preservado
      this.gunDir = adjustGunDirection(this.gunDir, actualDiff);
      if (Math.abs(actualDiff - targetDiff) > shootThreshold) shoot = false;
    } else {
      const [s, dir] = needShootTradTurning(this);
      shoot = s;
      if (shoot && dir !== this.myGundir) {
        if (dir === currentGundir) {
          ctrl |= Ctl.strafe;
          this.myGundir = currentGundir;
        } else {
          ctrl = controlsFromDirection(dir);
          this.myGundir = dir;
        }
      }
    }
    this.botPrevFire = shoot;
    // clearModifiersIfIdle
    const upDown = !!(ctrl & Ctl.up) !== !!(ctrl & Ctl.down);
    const leftRight = !!(ctrl & Ctl.left) !== !!(ctrl & Ctl.right);
    if (!upDown && !leftRight) ctrl &= ~(Ctl.run | Ctl.strafe);
    return { controls: ctrl, fire: shoot };
  }
}

