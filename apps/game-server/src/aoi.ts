// SPDX-License-Identifier: GPL-2.0-or-later
// Interesse por sala: o que cada jogador recebe em cada frame e quem vê cada evento. Port de
// `ServerNetworking::broadcast_frame` e das regras de visibilidade de src/world.cpp
// (plan/specs/snapshots-aoi.md).
import type { MessageOf } from '@outgun/protocol';
import type { GameSettings } from '@outgun/settings';
import { iround, MAX_PLAYERS, positiveModulo, ROOM_HEIGHT, ROOM_WIDTH, type PlayerState, type WorldState } from '@outgun/sim';

const hasFlag = (world: WorldState, pid: number) =>
  world.wildFlags.some((f) => f.carrier === pid) || world.teams.some((t) => t.flags.some((f) => f.carrier === pid));

/** `remotelyVisibleProperties`: bits do que se vê de um jogador no minimapa. */
export function remotelyVisibleProperties(p: PlayerState, time: number): number {
  return (
    (p.deathbringer ? 1 : 0) |
    (p.shield ? 2 : 0) |
    (p.power ? 4 : 0) |
    (p.turbo ? 8 : 0) |
    (p.visibility < 255 ? 16 : 0) |
    (p.visibility < 10 ? 32 : 0) |
    (p.underDeathbringerEffect(time) ? 64 : 0)
  );
}

/** `seesPropertiesRemotely`: 0 ninguém, 1 aliados, 2 todos. */
export function seesPropertiesRemotely(settings: GameSettings, viewer: PlayerState, target: PlayerState): boolean {
  const mode = settings.world.seeMinimapPlayerProperties;
  return viewer.team === target.team ? mode >= 1 : mode >= 2;
}

/** `doesPlayerSeeRocket`: distância em salas (com volta no mapa) até `see_rockets_distance`. */
export function seesRocket(world: WorldState, settings: GameSettings, viewer: PlayerState, roomX: number, roomY: number): boolean {
  const w = world.map.width;
  const h = world.map.height;
  let dx = positiveModulo(viewer.pos.roomX - roomX, w);
  let dy = positiveModulo(viewer.pos.roomY - roomY, h);
  if (dx > Math.trunc(w / 2)) dx = w - dx;
  if (dy > Math.trunc(h / 2)) dy = h - dy;
  return dx + dy <= settings.world.seeRocketsDistance;
}

/** `writeMinimapPlayerPosition`. */
export function minimapPosition(world: WorldState, p: PlayerState): { x: number; y: number } {
  const xmul = Math.trunc(255 / world.map.width);
  const ymul = Math.trunc(255 / world.map.height);
  return {
    x: p.pos.roomX * xmul + (Math.trunc((xmul * (p.pos.x - 1e-5)) / ROOM_WIDTH) & 255),
    y: p.pos.roomY * ymul + (Math.trunc((ymul * (p.pos.y - 1e-5)) / ROOM_HEIGHT) & 255),
  };
}

export interface MinimapViews {
  /** Quem cada time vê no minimapa, sem shadow e com shadow (índice = pid; máscaras de 32 bits no original). */
  readonly normal: readonly [readonly boolean[], readonly boolean[]];
  readonly shadow: readonly [readonly boolean[], readonly boolean[]];
}

/** Visão do minimapa de cada time (início de `broadcast_frame`). */
export function minimapViews(world: WorldState, settings: GameSettings): MinimapViews {
  const make = () => Array<boolean>(MAX_PLAYERS).fill(false);
  const normal = [make(), make()] as const;
  const shadow = [make(), make()] as const;
  const alive = world.players.filter((p): p is PlayerState => !!p && !p.dead); // mortos não veem nem são vistos
  for (const t of [0, 1] as const)
    for (const p of alive) {
      if (p.team === t) {
        normal[t][p.pid] = true; // aliados sempre visíveis
        for (const e of alive) {
          if (e.team === t) continue;
          const carrier = hasFlag(world, e.pid);
          const sameRoom = e.pos.roomX === p.pos.roomX && e.pos.roomY === p.pos.roomY;
          if ((sameRoom && (e.visibility > 10 || carrier)) || (settings.world.alwaysSendFlagLocation && carrier)) normal[t][e.pid] = true;
        }
      } else if (settings.powerups.shadowSeeShadow || !p.hasShadow() || hasFlag(world, p.pid)) shadow[t][p.pid] = true;
    }
  // portadores das bandeiras de um time aparecem para o outro
  for (const t of [0, 1] as const)
    for (const f of world.teams[t].flags)
      if (f.carrier >= 0) {
        normal[1 - t]![f.carrier] = true;
        shadow[1 - t]![f.carrier] = true;
      }
  for (const t of [0, 1] as const) for (let i = 0; i < MAX_PLAYERS; i++) shadow[t][i] ||= normal[t][i]!;
  return { normal, shadow };
}

/** Estado de rede de um destinatário que persiste entre frames. */
export class RecipientState {
  /** Próximo pid a tentar no rodízio do minimapa. */
  nextMinimapPlayer = 0;
  /** Jogadores do minimapa que o cliente aceita por frame (`data_set_minimap_player_bandwidth`). */
  minimapPerFrame = 2;
  /** Últimas propriedades informadas de cada jogador (`knownProperties`). */
  readonly known = new Int16Array(MAX_PLAYERS).fill(-1);
}

export type FrameMessage = MessageOf<'frame'>;

export interface FrameResult {
  readonly frame: FrameMessage;
  /** Propriedades de jogadores do minimapa que mudaram (evento `minimapProperties`). */
  readonly properties: { pid: number; properties: number }[];
}

/** Frame do destinatário `pid` (laço por cliente de `broadcast_frame`). */
export function buildFrame(
  world: WorldState,
  settings: GameSettings,
  views: MinimapViews,
  pid: number,
  rs: RecipientState,
  opts: {
    running: boolean;
    lastClientFrame: number;
    /** Atraso do último input dentro do frame, em frames (`ServerPlayer::frameOffset`). */
    frameOffset?: number;
    ping: { pid: number; ms: number } | null;
  },
): FrameResult {
  const me = world.players[pid] as PlayerState;
  const skipped = !opts.running || me.awaitingClientReadies > 0;
  // `bound(frameOffset, 0, .999) * 256` (servnet.cpp:2073)
  const frameOffset = Math.trunc(Math.min(0.999, Math.max(0, opts.frameOffset ?? 0)) * 256);
  const header = { frame: world.frame, lastClientFrame: opts.lastClientFrame & 255, frameOffset, skipped };
  if (skipped) return { frame: { ...header, self: null, players: [], minimap: [], ping: null } as FrameMessage, properties: [] };

  const time = world.time;
  const shadowSeeShadow = settings.powerups.shadowSeeShadow;
  const players: FrameMessage['players'][number][] = [];
  for (const h of world.players) {
    if (!h || h.pos.roomX !== me.pos.roomX || h.pos.roomY !== me.pos.roomY) continue;
    const forceVisible = me.hasShadow() && shadowSeeShadow && h !== me;
    if (h.visibility === 0 && h.team !== me.team && !hasFlag(world, h.pid) && !forceVisible) continue;
    const safeAfterSpawn = world.frame < h.startTakeDamageFrame;
    players.push({
      pid: h.pid,
      x: h.pos.x,
      y: h.pos.y,
      vx: h.dead ? 0 : h.vel.x,
      vy: h.dead ? 0 : h.vel.y,
      dead: h.dead,
      deathbringer: h.deathbringer,
      deathbringerAffected: h.deathbringerEnd > time,
      shield: h.shield !== 0,
      turbo: h.turbo,
      power: h.power,
      controls: h.dead ? 0 : h.controls,
      gundir: iround(h.gundir * 256) % 2048, // `toNetworkLongForm`
      visibility: safeAfterSpawn ? (world.frame & 2 ? 128 : 220) : forceVisible ? Math.max(128, h.visibility) : h.visibility,
    });
    rs.known[h.pid] = remotelyVisibleProperties(h, time);
  }

  // minimapa: quem o time vê, menos quem já está na sala, em rodízio
  const seen = [...(me.hasShadow() ? views.shadow : views.normal)[me.team]];
  for (const p of world.players) if (p && p.pos.roomX === me.pos.roomX && p.pos.roomY === me.pos.roomY) seen[p.pid] = false;
  const limit = Math.min(settings.server.minimapSendLimit, rs.minimapPerFrame);
  const minimap: FrameMessage['minimap'][number][] = [];
  const properties: { pid: number; properties: number }[] = [];
  if (limit > 0) {
    const start = rs.nextMinimapPlayer;
    for (let scanned = 0; scanned < MAX_PLAYERS && minimap.length < limit; scanned++) {
      const id = (start + scanned) % MAX_PLAYERS;
      if (!seen[id]) continue;
      const p = world.players[id] as PlayerState;
      minimap.push({ pid: id, ...minimapPosition(world, p) });
      rs.nextMinimapPlayer = (id + 1) % MAX_PLAYERS;
      if (seesPropertiesRemotely(settings, me, p)) {
        const props = remotelyVisibleProperties(p, time);
        if (rs.known[id] !== props) {
          rs.known[id] = props;
          properties.push({ pid: id, properties: props });
        }
      }
    }
  }

  return {
    frame: {
      ...header,
      self: {
        roomX: me.pos.roomX,
        roomY: me.pos.roomY,
        x: me.pos.x,
        y: me.pos.y,
        vx: me.vel.x,
        vy: me.vel.y,
        health: Math.round(me.health),
        energy: Math.round(me.energy),
      },
      players,
      minimap,
      ping: opts.ping,
    } as FrameMessage,
    properties,
  };
}
