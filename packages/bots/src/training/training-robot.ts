// SPDX-License-Identifier: GPL-2.0-or-later
// Bot do treino (OG-491, D-87, RN-TRN-03/08): usado só nas salas de treino. Herda do bot do Casual a
// mira, o combate, o desvio, a navegação e o nível (OG-266); o destino e o que ele pode fazer vêm só do
// papel, de uma lista fechada. O `Robot` do Casual não sabe que este arquivo existe (OG-513).
import { FLAG_RADIUS, PLAYER_RADIUS, Vec, type Rng, type WorldCoords } from '@outgun/sim';
import type { Area, AreaMap } from '../areamap.js';
import { Robot } from '../brain.js';
import { moveTo, moveToNoAggregate, setDestination } from '../navigation.js';
import { Ctl, DestinationType } from '../robot-core.js';
import { basesOf } from '../situation.js';
import type { BotPlayer, BotView } from '../view.js';

/**
 * Papéis do treino: **guard** guarda a base do próprio time; **attack** vai à bandeira do outro time e
 * tenta sair com ela; **chase** persegue o portador; **carry** leva a bandeira do outro time para casa;
 * **escort** escolta o portador do próprio time.
 */
export type TrainingRole = 'guard' | 'attack' | 'chase' | 'carry' | 'escort';

export const TRAINING_ROLES: readonly TrainingRole[] = ['guard', 'attack', 'chase', 'carry', 'escort'];

/** Só quem ataca ou leva a bandeira pode pegar uma (a trava do servidor usa a mesma regra). */
export function roleMayTakeFlag(role: TrainingRole): boolean {
  return role === 'attack' || role === 'carry';
}

const other = (team: number): 0 | 1 => (team === 0 ? 1 : 0);

export class TrainingRobot extends Robot {
  constructor(
    view: BotView,
    areaMap: AreaMap,
    me: number,
    rng: Rng,
    public role: TrainingRole,
  ) {
    super(view, areaMap, me, rng);
  }

  /** Ponto da bandeira do time (o "posto" de quem guarda). */
  private base(team: number): WorldCoords | undefined {
    return basesOf(this, team)[0];
  }

  private inRoomOf(c: WorldCoords): boolean {
    return this.myPos.roomX === c.room.x && this.myPos.roomY === c.room.y;
  }

  /** Portador vivo da bandeira do time `flagTeam`, ou null. */
  private carrierOf(flagTeam: number): BotPlayer | null {
    for (const f of this.fx.world.flagsOf(flagTeam)) {
      if (f.status !== 'carried') continue;
      const p = this.player(f.carrier);
      if (p.used && !p.dead) return p;
    }
    return null;
  }

  private goTo(area: Area, type: DestinationType): void {
    this.destinationType = type;
    setDestination(this, area);
  }

  /** Bandeiras: só quem ataca ou leva pega; os outros nem chegam perto (RN-TRN-03). */
  override getFlag(): number {
    if (this.role === 'carry') return super.getFlag();
    if (this.role !== 'attack') return 0;
    if (this.haveFlag(this.me)) return 0; // com a bandeira, o destino é sair da base
    for (const f of this.fx.world.flagsOf(other(this.myTeam()))) {
      if (f.status === 'carried' || this.areaOf(f.pos) !== this.myArea()) continue;
      return moveTo(this, f.pos.local().sub(this.myPos.local()), PLAYER_RADIUS + FLAG_RADIUS);
    }
    return 0;
  }

  /** Destino pelo papel; nunca o destino livre do Casual. */
  override chooseDestination(): void {
    const myTeam = this.myTeam();
    this.destinationType = DestinationType.None;
    switch (this.role) {
      case 'guard': {
        const b = this.base(myTeam);
        if (b) this.goTo(this.areaMap.identifyArea(b), DestinationType.Base);
        return;
      }
      case 'attack':
      case 'carry': {
        // com a bandeira: para casa, pelo caminho do bot do Casual
        if (this.haveFlag(this.me)) return super.chooseDestination();
        const mate = this.carrierOf(other(myTeam));
        if (mate && mate.pid !== this.me) return this.goTo(this.areaOf(mate.pos), DestinationType.Team);
        const flag = this.fx.world.flagsOf(other(myTeam))[0];
        if (flag) this.goTo(this.areaOf(flag.pos), DestinationType.Flag);
        return;
      }
      case 'chase': {
        const target = this.carrierOf(myTeam) ?? this.nearestEnemy();
        if (target) this.goTo(this.areaOf(target.pos), DestinationType.Team);
        return;
      }
      case 'escort': {
        const mate = this.carrierOf(other(myTeam));
        if (mate && mate.pid !== this.me) return this.goTo(this.areaOf(mate.pos), DestinationType.Team);
        const b = this.base(myTeam);
        if (b) this.goTo(this.areaMap.identifyArea(b), DestinationType.Base);
        return;
      }
    }
  }

  /** Inimigo vivo mais perto (em salas), para o perseguidor sem portador à vista. */
  private nearestEnemy(): BotPlayer | null {
    let best: BotPlayer | null = null;
    let bestD = Infinity;
    for (const p of this.fx.players) {
      if (!p.used || p.dead || this.isMyTeam(p) || p.pos.roomX >= this.fx.map.width || p.pos.roomY >= this.fx.map.height) continue;
      const d = Math.abs(p.pos.roomX - this.myPos.roomX) + Math.abs(p.pos.roomY - this.myPos.roomY);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Sem nada a fazer: guarda volta ao posto; escolta e atacantes seguem o portador; ninguém passeia. */
  override followFlag(): number {
    if (this.role === 'escort' || this.role === 'attack') {
      const ctrl = super.followFlag();
      if (ctrl !== 0) return ctrl;
    }
    if (this.role !== 'guard') return this.role === 'chase' ? 0 : Ctl.strafe;
    const b = this.base(this.myTeam());
    if (!b || !this.inRoomOf(b)) return 0;
    const post = new Vec(b.x, b.y).sub(this.myPos.local());
    if (post.mag() < 4 * PLAYER_RADIUS) return Ctl.strafe; // "não faça nada" em vez de passear
    return moveToNoAggregate(this, post, 3 * PLAYER_RADIUS);
  }
}
