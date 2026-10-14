// SPDX-License-Identifier: GPL-2.0-or-later
// Convites do beta fechado (OG-106), usados pelo painel e pela CLI (o primeiro convite, do admin).
import { randomBytes } from 'node:crypto';
import type { Db } from './db/client.js';
import { betaInvites } from './db/schema.js';

// sem letras e números parecidos (0/O, 1/I): o código pode ser ditado
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function inviteCode(): string {
  return Array.from(randomBytes(10), (x) => ALPHABET[x % ALPHABET.length]).join('');
}

export async function createInvites(db: Db, o: { count: number; maxUses?: number; note?: string; expiresDays?: number; createdBy?: string | null }): Promise<string[]> {
  const codes = Array.from({ length: o.count }, inviteCode);
  const expiresAt = o.expiresDays ? new Date(Date.now() + o.expiresDays * 86_400_000) : null;
  await db.insert(betaInvites).values(codes.map((code) => ({ code, note: o.note ?? '', maxUses: o.maxUses ?? 1, createdBy: o.createdBy ?? null, expiresAt })));
  return codes;
}
