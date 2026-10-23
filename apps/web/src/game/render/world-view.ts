// SPDX-License-Identifier: GPL-2.0-or-later
// Do estado do mundo (`WorldState` da sim local ou extrapolado do servidor) para o que o renderer de
// entidades desenha (plan/specs/render-entidades.md).
import { ROOM_HEIGHT, Vec, type GameMap, type WorldCoords, type WorldState } from '@outgun/sim';
import type { EntityFrame, FlagView, PlayerView, RocketView } from './entity-frame.js';

const coords = (p: { roomX: number; roomY: number; x: number; y: number }): WorldCoords => ({ room: { x: p.roomX, y: p.roomY }, x: p.x, y: p.y });

export interface WorldViewOptions {
  /** Jogador local (−1 = nenhum). */
  readonly me: number;
  readonly name: (pid: number) => string;
  /** Número do jogador (OG-410); sem número, undefined. */
  readonly number?: (pid: number) => number | undefined;
  readonly numberStyle?: (pid: number) => number | undefined;
  /** Cor pessoal 0..15 (16 = desconhecida). */
  readonly color: (pid: number) => number;
  /** Fim do pisca de acerto, no tempo do quadro (s); 0 = sem acerto. */
  readonly hitfx: (pid: number) => number;
  /** Segundos até o jogador local renascer (0 = não mostra). */
  readonly respawnIn: number;
  /** Quando cada bandeira (`time.índice`) voltou à base, em s (pisca por 2 s). */
  readonly flagReturnTime: (key: string) => number | undefined;
  readonly flagReturnDelay: number;
  readonly maxRunSpeed: number;
  readonly multiRoom: boolean;
}

/** Sombra do foguete: só sobre o chão (o original troca os raios: `r.power ? ROCKET_RADIUS : POWER_ROCKET_RADIUS`). */
function rocketShadow(map: GameMap, rk: { power: boolean; pos: { roomX: number; roomY: number; x: number; y: number } }): boolean {
  const radius = rk.power ? 4 : 6;
  const sy = rk.pos.y + radius + 8;
  const room = map.rooms[rk.pos.roomX]?.[rk.pos.roomY];
  return sy < ROOM_HEIGHT && !(room?.fallOnWallCirc(new Vec(rk.pos.x, sy), radius / 2) ?? true);
}

export function entityFrameFromWorld(w: WorldState, o: WorldViewOptions): EntityFrame {
  const time = w.frame / 10;
  const meTeam = w.players[o.me]?.team ?? w.teamOf(Math.max(0, o.me));
  const players: PlayerView[] = [];
  for (const pl of w.players) {
    if (!pl) continue;
    let alpha = pl.visibility;
    if (pl.team === meTeam) alpha = Math.max(alpha, 128); // `min_alpha_friends`
    players.push({
      pid: pl.pid,
      team: pl.team,
      color: o.color(pl.pid),
      name: o.name(pl.pid),
      ...((n) => (n ? { number: n, numberStyle: o.numberStyle?.(pl.pid) ?? 0 } : {}))(o.number?.(pl.pid)),
      pos: coords(pl.pos),
      gundir: pl.gundir,
      dead: pl.dead,
      hitfx: o.hitfx(pl.pid),
      power: pl.power,
      turboTrail: pl.turbo && pl.vel.x * pl.vel.x + pl.vel.y * pl.vel.y > o.maxRunSpeed ** 2,
      shield: pl.shield > 0,
      deathbringer: pl.deathbringer,
      deathbringerAffected: pl.underDeathbringerEffect(w.time),
      alpha,
      frags: pl.stats.frags,
      me: pl.pid === o.me,
      respawnIn: pl.pid === o.me && pl.dead ? o.respawnIn : 0,
    });
  }
  const rockets: RocketView[] = [];
  for (const rk of w.rockets) {
    if (rk.owner === -1) continue;
    rockets.push({ team: rk.team as 0 | 1, power: rk.power, pos: coords(rk.pos), direction: rk.direction, shadow: rocketShadow(w.map, rk) });
  }
  const flags: FlagView[] = [];
  for (const team of [0, 1, 2] as const)
    w.flagsOf(team).forEach((f, i) =>
      flags.push({
        team,
        pos: coords(f.pos),
        carrier: f.carrier,
        flash: time < (o.flagReturnTime(`${team}.${i}`) ?? -10) + 2 && Math.trunc((time * 15) % 3) === 0,
        returnIn: team !== 2 && f.status === 'dropped' ? f.dropTime + o.flagReturnDelay - time : 0,
      }),
    );
  return {
    time,
    players,
    rockets,
    powerups: w.items.filter((it) => it.isReal()).map((it) => ({ kind: it.kind, pos: coords(it.pos) })),
    flags,
    deathbringers: w.explosions.map((db) => ({ pos: coords(db.pos), team: db.ownerTeam as 0 | 1, radius: db.radius(w.frame) })),
    multiRoom: o.multiRoom,
  };
}
