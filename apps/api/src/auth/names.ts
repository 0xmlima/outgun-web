// SPDX-License-Identifier: GPL-2.0-or-later
// Disponibilidade de nomes (OG-082, RN-NOM-02): um nome está ocupado se o nome comparável é de uma
// conta ou está reservado (nome antigo de quem trocou de nome, por 90 dias).
import { checkName, guestName } from '@outgun/protocol';
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { usernameKey } from '../db/keys.js';
import { reservedNames, users } from '../db/schema.js';

export const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60_000;
export const RESERVATION_MS = 90 * 24 * 60 * 60_000;

/** Dono do nome (conta ou reserva vigente), ou undefined se o nome está livre. */
export async function nameOwner(db: Pick<Db, 'select'>, name: string): Promise<string | undefined> {
  const key = usernameKey(name);
  if (key === '') return undefined;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.usernameKey, key));
  if (user) return user.id;
  const [reserved] = await db
    .select({ id: reservedNames.userId })
    .from(reservedNames)
    .where(and(eq(reservedNames.nameKey, key), gt(reservedNames.reservedUntil, new Date())));
  return reserved?.id;
}

export type GuestNameCheck = { ok: true; name: string } | { ok: false; reason: 'invalid' | 'registered' };

/** Nome de convidado (só Casual): válido, não registrado nem reservado; exibido com o sufixo `*`. */
export async function checkGuestName(db: Pick<Db, 'select'>, name: string): Promise<GuestNameCheck> {
  if (!checkName(name)) return { ok: false, reason: 'invalid' };
  if (await nameOwner(db, name)) return { ok: false, reason: 'registered' };
  return { ok: true, name: guestName(name) };
}
