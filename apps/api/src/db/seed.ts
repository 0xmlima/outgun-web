// SPDX-License-Identifier: GPL-2.0-or-later
// Dados de desenvolvimento: temporada ativa, salas main (Casual) e ranked, um admin e dois
// jogadores (senha "outgun-dev"). Idempotente: rodar de novo não duplica nada.
import { hash } from '@node-rs/argon2';
import type { Db } from './client.js';
import { emailKey, usernameKey } from './keys.js';
import { playerProfiles, rooms, seasons, users } from './schema.js';

export const SEED_PASSWORD = 'outgun-dev';
export const SEED_USERS = [
  { username: 'Admin', email: 'admin@outgun.local', isAdmin: true },
  { username: 'Jogador1', email: 'jogador1@outgun.local', isAdmin: false },
  { username: 'Jogador2', email: 'jogador2@outgun.local', isAdmin: false },
] as const;

export async function seed(db: Db): Promise<void> {
  const passwordHash = await hash(SEED_PASSWORD);
  await db.transaction(async (tx) => {
    const [season] = await tx.select({ id: seasons.id }).from(seasons).limit(1);
    if (!season) await tx.insert(seasons).values({ name: 'Temporada 1', startsAt: new Date('2026-01-01T00:00:00Z'), active: true });
    await tx
      .insert(rooms)
      .values([
        { id: 'main', name: 'Principal', mode: 'casual', preset: 'classic', maxPlayers: 16, persistent: true },
        { id: 'ranked', name: 'Ranked', mode: 'ranked', preset: 'ranked', maxPlayers: 16, persistent: true },
      ])
      .onConflictDoNothing();
    for (const u of SEED_USERS) {
      const [row] = await tx
        .insert(users)
        .values({
          username: u.username,
          usernameKey: usernameKey(u.username),
          email: u.email,
          emailKey: emailKey(u.email),
          passwordHash,
          isAdmin: u.isAdmin,
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      if (row) await tx.insert(playerProfiles).values({ userId: row.id });
    }
  });
}
