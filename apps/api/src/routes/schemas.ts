// SPDX-License-Identifier: GPL-2.0-or-later
// Esquemas compartilhados (viram components na OpenAPI).
import { Type } from '@fastify/type-provider-typebox';

export const GameModeSchema = Type.Union([Type.Literal('casual'), Type.Literal('ranked')]);
export const RoomId = Type.String({ pattern: '^[a-z0-9][a-z0-9-]{0,31}$' });
export const ErrorSchema = Type.Object({ error: Type.String(), message: Type.String() });

/** Uma sala é considerada no ar se o game server mandou heartbeat há menos disso. */
export const ROOM_ONLINE_MS = 30_000;
