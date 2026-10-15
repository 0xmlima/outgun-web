// SPDX-License-Identifier: GPL-2.0-or-later
// Configuração da plataforma editada no painel admin (OG-087) e entregue aos game servers na
// resposta do heartbeat: presets Casual criados no painel e rotações de mapas por modo. Os presets
// do código (Clássico, Ranked etc.) só mudam com uma versão nova do jogo — o Ranked, travado, só por
// decisão do PO (RN-MOD-04).
import { PRESETS, type Preset, type RotationKey } from '@outgun/settings';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Db } from './db/client.js';
import { adminCommands, bans, casualPresets, mapRotations, users } from './db/schema.js';

export interface PlatformConfig {
  /** Muda quando qualquer preset ou rotação muda (o game server só reaplica se mudar). */
  version: string;
  presets: { id: string; description: string; overrides: string }[];
  rotations: Partial<Record<RotationKey, string[]>>;
}

/** Presets Casual do painel ainda ativos. */
export async function panelPresets(db: Db): Promise<Preset[]> {
  const rows = await db.select().from(casualPresets).where(isNull(casualPresets.deletedAt)).orderBy(asc(casualPresets.id));
  return rows.map((r) => ({ id: r.id, mode: 'casual', locked: false, description: r.description, overrides: r.overrides }));
}

/** Preset do código ou do painel, para conferir salas e criar salas privadas. */
export async function findPreset(db: Db, id: string): Promise<Preset | undefined> {
  return PRESETS.find((p) => p.id === id) ?? (await panelPresets(db)).find((p) => p.id === id);
}

export async function platformConfig(db: Db): Promise<PlatformConfig> {
  const presets = (await panelPresets(db)).map(({ id, description, overrides }) => ({ id, description, overrides }));
  const rotations: PlatformConfig['rotations'] = {};
  for (const r of await db.select().from(mapRotations)) rotations[r.key] = r.maps;
  const version = createHash('sha256').update(JSON.stringify({ presets, rotations })).digest('hex').slice(0, 16);
  return { version, presets, rotations };
}

export interface CommandForServer {
  id: number;
  roomId: string;
  kind: 'kick' | 'ban' | 'mute' | 'unmute' | 'message';
  uid?: number;
  minutes?: number;
  reason?: string;
  text?: string;
  actor: string;
}

/** Comandos ainda não entregues a este servidor; ficam marcados como entregues. */
export async function takeCommands(db: Db, serverId: string, now = new Date()): Promise<CommandForServer[]> {
  const rows = await db
    .update(adminCommands)
    .set({ deliveredAt: now })
    .where(and(eq(adminCommands.serverId, serverId), isNull(adminCommands.deliveredAt)))
    .returning();
  return rows
    .sort((a, b) => a.id - b.id)
    .map((r) => ({ id: r.id, roomId: r.roomId, kind: r.kind, actor: r.actorName, ...r.args }));
}

export interface CommandAck {
  id: number;
  ok: boolean;
  text?: string | undefined;
  /** Quem o comando atingiu: conta, IP e dispositivo, para o ban (o painel só conhece o uid). */
  target?: { name: string; accountId?: string | undefined; ip?: string | undefined; device?: string | undefined } | undefined;
}

/**
 * Resultado dos comandos executados. Ban: o registro de ban é criado aqui, com o que o game server
 * sabe do jogador (conta, IP, dispositivo); de sala (até 7 dias) ou de plataforma.
 */
export async function applyAcks(db: Db, serverId: string, acks: readonly CommandAck[], now = new Date()): Promise<void> {
  if (acks.length === 0) return;
  const rows = await db
    .select()
    .from(adminCommands)
    .where(and(eq(adminCommands.serverId, serverId), inArray(adminCommands.id, acks.map((a) => a.id)), isNull(adminCommands.doneAt)));
  for (const cmd of rows) {
    const ack = acks.find((a) => a.id === cmd.id)!;
    await db.transaction(async (tx) => {
      await tx
        .update(adminCommands)
        .set({ doneAt: now, result: { ok: ack.ok, ...(ack.text ? { text: ack.text } : {}), ...(ack.target ? { target: ack.target.name } : {}) } })
        .where(eq(adminCommands.id, cmd.id));
      if (cmd.kind !== 'ban' || !ack.ok || !ack.target) return;
      const t = ack.target;
      const [account] = t.accountId ? await tx.select({ id: users.id }).from(users).where(eq(users.id, t.accountId)) : [];
      const ip = t.ip && (/^(\d{1,3}\.){3}\d{1,3}$/.test(t.ip) || /^[0-9a-f:]+$/i.test(t.ip)) ? t.ip : null;
      const device = t.device && /^[0-9a-f]{32}$/.test(t.device) ? t.device : null;
      if (!account && !ip && !device) return;
      const minutes = cmd.args.minutes ?? 0;
      await tx.insert(bans).values({
        userId: account?.id ?? null,
        ip,
        deviceHash: device,
        roomId: cmd.platform ? null : cmd.roomId,
        reason: cmd.args.reason ?? '',
        createdBy: cmd.actorUserId,
        createdAt: now,
        expiresAt: minutes > 0 ? new Date(now.getTime() + minutes * 60_000) : null,
      });
    });
  }
}
