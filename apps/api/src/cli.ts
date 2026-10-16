// SPDX-License-Identifier: GPL-2.0-or-later
// Utilitários: node dist/cli.js migrate up|down [N]|status, seed, openapi [arquivo], season start NOME, ticket-key [kid],
// invite [usos] [observação] (convite do beta), role NOME admin|moderator|player, milestones (marcos retroativos).
import { writeFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connect } from './db/client.js';
import { appliedVersions, loadMigrations, migrateDown, migrateUp } from './db/migrate.js';
import { ensureAppRole } from './db/app-role.js';
import { seed } from './db/seed.js';
import { backfillMilestones } from './milestones.js';
import { startSeason } from './ranking.js';
import { createInvites } from './beta.js';
import { usernameKey } from './db/keys.js';
import { playerProfiles, users } from './db/schema.js';
import { mailLocale, welcomeMail } from './mail/templates.js';
import { mailerFor } from './app.js';
import { eq } from 'drizzle-orm';
import { exportSigningKey, generateSigningKey } from '@outgun/tickets';

const [command, arg1, arg2] = process.argv.slice(2);
const config = loadConfig();
const database = connect(config.databaseUrl, 1);

try {
  if (command === 'migrate' && arg1 === 'up') {
    console.log('aplicadas:', (await migrateUp(database.sql)).join(', ') || 'nenhuma');
    // OG-308: a API usa um papel sem DDL; as migrations (este comando) seguem com o dono do schema
    if (process.env.APP_DB_PASSWORD) {
      const role = process.env.APP_DB_USER ?? 'outgun_app';
      await ensureAppRole(database.sql, role, process.env.APP_DB_PASSWORD);
      console.log(`papel da aplicação ${role} conferido`);
    }
  } else if (command === 'migrate' && arg1 === 'down') {
    console.log('desfeitas:', (await migrateDown(database.sql, Number(arg2 ?? 1))).join(', ') || 'nenhuma');
  } else if (command === 'migrate' && arg1 === 'status') {
    const applied = new Set(await appliedVersions(database.sql));
    for (const m of loadMigrations()) console.log(`${applied.has(m.version) ? '[x]' : '[ ]'} ${m.version} ${m.name}`);
  } else if (command === 'seed') {
    await migrateUp(database.sql);
    await seed(database.db);
    console.log('seed aplicado');
  } else if (command === 'openapi') {
    // Gera a especificação sem abrir porta nem tocar no banco.
    const app = await buildApp({ config, database, logger: false });
    await app.ready();
    const file = arg1 ?? 'openapi.json';
    writeFileSync(file, `${JSON.stringify(app.swagger(), null, 2)}\n`);
    await app.close();
    console.log(`OpenAPI gravada em ${file}`);
  } else if (command === 'season' && arg1 === 'start' && arg2) {
    // Encerra a temporada ativa e abre outra (OG-084); o ranking recomeça do zero nela.
    const season = await startSeason(database.db, arg2);
    console.log(`temporada ${season.id} (${season.name}) ativa`);
  } else if (command === 'ticket-key') {
    // Nova chave Ed25519 para TICKET_SIGNING_KEYS (ponha na frente da atual para rotacionar).
    console.log(exportSigningKey(generateSigningKey(arg1 ?? `k${new Date().toISOString().slice(0, 10)}`)));
  } else if (command === 'welcome' && arg1) {
    // Reenvia o e-mail de boas-vindas a uma conta (D-23: Resend; MAILER e RESEND_API_KEY do ambiente).
    const [user] = await database.db.select().from(users).where(eq(users.usernameKey, usernameKey(arg1)));
    if (!user) {
      console.error(`conta não encontrada: ${arg1}`);
      process.exitCode = 1;
    } else {
      const [profile] = await database.db.select({ language: playerProfiles.language }).from(playerProfiles).where(eq(playerProfiles.userId, user.id));
      await mailerFor(config).send(welcomeMail(user.email, user.username, config.webUrl, mailLocale(profile?.language)));
      console.log(`boas-vindas enviadas para ${user.username}`);
    }
  } else if (command === 'milestones') {
    // Marcos retroativos (OG-213): idempotente, pode rodar de novo a qualquer momento.
    const r = await backfillMilestones(database.db, { beta: config.beta });
    console.log(`marcos: ${r.added} novos em ${r.users} contas`);
  } else if (command === 'invite') {
    // Convite do beta fechado (OG-106) sem passar pelo painel: o primeiro admin se cadastra com ele.
    const [code] = await createInvites(database.db, { count: 1, maxUses: Number(arg1 ?? 1) || 1, note: arg2 ?? 'cli' });
    console.log(code);
  } else if (command === 'role' && arg1 && ['admin', 'moderator', 'player'].includes(arg2 ?? '')) {
    const rows = await database.db
      .update(users)
      .set({ isAdmin: arg2 === 'admin', isModerator: arg2 === 'moderator', updatedAt: new Date() })
      .where(eq(users.usernameKey, usernameKey(arg1)))
      .returning({ username: users.username });
    if (rows.length === 0) {
      console.error(`conta não encontrada: ${arg1}`);
      process.exitCode = 1;
    } else console.log(`${rows[0]!.username}: ${arg2}`);
  } else {
    console.error('uso: cli.js migrate up|down [N]|status | seed | openapi [arquivo] | season start NOME | ticket-key [kid] | invite [usos] [observação] | role NOME admin|moderator|player | welcome NOME');
    process.exitCode = 2;
  }
} finally {
  await database.close();
}
