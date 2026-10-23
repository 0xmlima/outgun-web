// SPDX-License-Identifier: GPL-2.0-or-later
// Configuração da plataforma editada no painel admin (OG-087) e entregue aos game servers na
// resposta do heartbeat: presets Casual criados no painel, rotações de mapas por modo e os nomes dos
// bots (OG-403). Os presets
// do código (Clássico, Ranked etc.) só mudam com uma versão nova do jogo — o Ranked, travado, só por
// decisão do PO (RN-MOD-04).
import { activeBotNames, botChatConfig, PRESETS, type BotChatConfig, type BotNames, type BotNamesConfig, type Preset, type RotationKey } from '@outgun/settings';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Db } from './db/client.js';
import { adminCommands, bans, botSettings, casualPresets, mapRotations, panelMaps, users } from './db/schema.js';

export interface PlatformConfig {
  /** Muda quando qualquer preset ou rotação muda (o game server só reaplica se mudar). */
  version: string;
  presets: { id: string; description: string; overrides: string }[];
  rotations: Partial<Record<RotationKey, string[]>>;
  /** Mapas publicados pela moderação (OG-367): o game server baixa o texto que não tem. */
  maps: { name: string; crc: number }[];
  /** Nomes e prefixos ativos dos bots (OG-403). */
  bots: BotNames;
  /** Chat dos bots (OG-404), já completado com o padrão. */
  botChat: BotChatConfig;
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

/** Rotação Casual do painel (D-69); null = sem rotação no painel (vale a do servidor). */
export async function casualRotation(db: Db): Promise<string[] | null> {
  const [row] = await db.select({ maps: mapRotations.maps }).from(mapRotations).where(eq(mapRotations.key, 'casual'));
  return row?.maps ?? null;
}

/** Cadastros da aba Bots (OG-403); sem linha, vazios (o game server usa o gerador). */
export async function botNamesConfig(db: Db): Promise<BotNamesConfig> {
  const [row] = await db.select({ prefixes: botSettings.prefixes, names: botSettings.names }).from(botSettings).where(eq(botSettings.id, 1));
  return { prefixes: row?.prefixes ?? [], names: row?.names ?? [] };
}

/** Chat dos bots da aba Bots (OG-404), completado com o padrão do jogo. */
export async function botChat(db: Db): Promise<BotChatConfig> {
  const [row] = await db.select({ chat: botSettings.chat }).from(botSettings).where(eq(botSettings.id, 1));
  return botChatConfig(row?.chat);
}

export async function platformConfig(db: Db): Promise<PlatformConfig> {
  const presets = (await panelPresets(db)).map(({ id, description, overrides }) => ({ id, description, overrides }));
  const rotations: PlatformConfig['rotations'] = {};
  for (const r of await db.select().from(mapRotations)) rotations[r.key] = r.maps;
  const maps = await db.select({ name: panelMaps.name, crc: panelMaps.crc }).from(panelMaps).where(isNull(panelMaps.deletedAt)).orderBy(asc(panelMaps.name));
  const bots = activeBotNames(await botNamesConfig(db));
  const chat = await botChat(db);
  const version = createHash('sha256').update(JSON.stringify({ presets, rotations, maps, bots, chat })).digest('hex').slice(0, 16);
  return { version, presets, rotations, maps, bots, botChat: chat };
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
