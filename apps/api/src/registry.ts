// SPDX-License-Identifier: GPL-2.0-or-later
// Registro de salas e game servers (OG-086), no lugar do master server do original: os servidores
// mandam heartbeat (POST /internal/rooms/heartbeat) e a API decide onde cada sala roda. Uma sala
// que ainda não está no ar é aberta no servidor menos carregado pelo próprio ticket de entrada
// (claim `spawn`), sem chamada direta da API ao servidor.
import type { RoomSpawn } from '@outgun/tickets';
import { eq, gt } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { gameServers, rooms } from './db/schema.js';

/** Intervalo dos heartbeats dos game servers. */
export const HEARTBEAT_MS = 3_000;
/** Sala (ou servidor) sem heartbeat há mais disso sai do ar: some do lobby em ≤ 10 s. */
export const ONLINE_MS = 10_000;

export type RoomRow = typeof rooms.$inferSelect;
export type ServerRow = typeof gameServers.$inferSelect;

export function roomOnline(room: Pick<RoomRow, 'lastHeartbeatAt'>, now = Date.now()): boolean {
  return room.lastHeartbeatAt !== null && now - room.lastHeartbeatAt.getTime() < ONLINE_MS;
}

export async function onlineServers(db: Db, now = Date.now()): Promise<ServerRow[]> {
  return db
    .select()
    .from(gameServers)
    .where(gt(gameServers.lastHeartbeatAt, new Date(now - ONLINE_MS)));
}

/**
 * Servidor menos carregado (menos jogadores por sala livre) com vaga para mais uma sala; a região
 * pedida tem preferência.
 */
export function pickServer(servers: readonly ServerRow[], region?: string): ServerRow | undefined {
  const free = servers.filter((s) => s.rooms < s.maxRooms);
  const pool = region && free.some((s) => s.region === region) ? free.filter((s) => s.region === region) : free;
  return [...pool].sort((a, b) => a.players - b.players || a.rooms - b.rooms || a.id.localeCompare(b.id))[0];
}

export function roomSpawn(room: RoomRow): RoomSpawn {
  return {
    name: room.name,
    mode: room.mode,
    preset: room.preset,
    maxPlayers: room.maxPlayers,
    persistent: room.persistent,
    ...(room.maps && room.maps.length > 0 ? { maps: room.maps } : {}),
  };
}

export type Placement = { ok: true; wsUrl: string; spawn?: RoomSpawn } | { ok: false };

/**
 * Onde o jogador conecta: no servidor que hospeda a sala; se ela não está no ar, no servidor ao
 * qual já foi atribuída (se ainda estiver no ar) ou no menos carregado, com o pedido de abertura.
 * Sem servidor algum, cai em `devRoomWsUrl` (desenvolvimento, servidor sem heartbeat).
 */
export async function placeRoom(db: Db, room: RoomRow, devRoomWsUrl: string | undefined, region?: string, now = Date.now()): Promise<Placement> {
  if (roomOnline(room, now) && room.wsUrl) return { ok: true, wsUrl: room.wsUrl };
  const servers = await onlineServers(db, now);
  const server = servers.find((s) => s.id === room.serverId) ?? pickServer(servers, region);
  if (server) {
    const wsUrl = `${server.wsBaseUrl.replace(/\/$/, '')}/rooms/${room.id}`;
    if (server.id !== room.serverId || wsUrl !== room.wsUrl) {
      await db.update(rooms).set({ serverId: server.id, wsUrl }).where(eq(rooms.id, room.id));
    }
    return { ok: true, wsUrl, spawn: roomSpawn(room) };
  }
  const dev = devRoomWsUrl?.replace('{id}', room.id);
  return dev ? { ok: true, wsUrl: dev, spawn: roomSpawn(room) } : { ok: false };
}

/** A sala pode ser listada no lobby: no ar, ou da plataforma e abrível agora. */
export function roomListed(room: RoomRow, canSpawn: boolean, now = Date.now()): boolean {
  return roomOnline(room, now) || (room.persistent && canSpawn);
}
