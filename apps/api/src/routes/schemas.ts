// SPDX-License-Identifier: GPL-2.0-or-later
// Esquemas compartilhados (viram components na OpenAPI).
import { Type } from '@fastify/type-provider-typebox';
import { EMBLEM_FRAMES, EMBLEM_SYMBOLS, type ClanEmblem } from '@outgun/protocol';

export const GameModeSchema = Type.Union([Type.Literal('casual'), Type.Literal('ranked')]);
/** Formato do Ranked (OG-250, RN-RKL-01). */
export const RankedFormatSchema = Type.Union([Type.Literal('3x3'), Type.Literal('4x4'), Type.Literal('5x5')]);
/** Fase do lobby Ranked (OG-252). */
export const LobbyPhaseSchema = Type.Union([Type.Literal('lobby'), Type.Literal('vote'), Type.Literal('ready'), Type.Literal('countdown'), Type.Literal('game'), Type.Literal('finished')]);
/** Série md1/md3/md5 (OG-250, RN-RKL-02). */
export const SeriesBestOfSchema = Type.Union([Type.Literal(1), Type.Literal(3), Type.Literal(5)]);
export const RoomId = Type.String({ pattern: '^[a-z0-9][a-z0-9-]{0,31}$' });
export const ErrorSchema = Type.Object({ error: Type.String(), message: Type.String() });

/** Emblema do clã (OG-482, RN-EMB-01): listas fechadas do protocolo. */
export const EmblemSchema = Type.Object({
  frame: Type.Unsafe<ClanEmblem['frame']>({ type: 'string', enum: [...EMBLEM_FRAMES] }),
  symbol: Type.Unsafe<ClanEmblem['symbol']>({ type: 'string', enum: [...EMBLEM_SYMBOLS] }),
  fillet: Type.Boolean(),
  inverted: Type.Boolean(),
});
