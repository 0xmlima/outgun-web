// SPDX-License-Identifier: GPL-2.0-or-later
// Lista pública de salas (substitui a lista do master server do original).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { asc } from 'drizzle-orm';
import type { AppDeps } from '../app.js';
import { rooms } from '../db/schema.js';
import { GameModeSchema, ROOM_ONLINE_MS, RoomId } from './schemas.js';

const RoomSummary = Type.Object({
  id: RoomId,
  name: Type.String(),
  mode: GameModeSchema,
  preset: Type.String(),
  hasPassword: Type.Boolean(),
  maxPlayers: Type.Integer(),
  players: Type.Integer(),
  map: Type.Union([Type.String(), Type.Null()]),
  online: Type.Boolean(),
});

export function roomRoutes({ database }: AppDeps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      '/rooms',
      {
        schema: {
          tags: ['salas'],
          summary: 'Salas cadastradas e quantos jogadores há em cada uma',
          response: { 200: Type.Object({ rooms: Type.Array(RoomSummary) }) },
        },
      },
      async () => {
        const now = Date.now();
        const list = await database.db.select().from(rooms).orderBy(asc(rooms.mode), asc(rooms.id));
        return {
          rooms: list.map((r) => {
            const online = r.lastHeartbeatAt !== null && now - r.lastHeartbeatAt.getTime() < ROOM_ONLINE_MS;
            return {
              id: r.id,
              name: r.name,
              mode: r.mode,
              preset: r.preset,
              hasPassword: r.passwordHash !== null,
              maxPlayers: r.maxPlayers,
              players: online ? r.players : 0,
              map: online ? r.map : null,
              online,
            };
          }),
        };
      },
    );
  };
}
