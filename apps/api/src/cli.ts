// SPDX-License-Identifier: GPL-2.0-or-later
// Utilitários: node dist/cli.js migrate up|down [N]|status, seed, openapi [arquivo], season start NOME, ticket-key [kid],
// invite [usos] [observação] (convite do beta), role NOME admin|moderator|player, milestones (marcos retroativos), milestones-calibrate (contas por marco, sem gravar).
import { writeFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connect } from './db/client.js';
import { appliedVersions, loadMigrations, migrateDown, migrateUp } from './db/migrate.js';
import { ensureAppRole, ensureMonitorRole } from './db/app-role.js';
import { seed } from './db/seed.js';
import { backfillMilestones, calibrateMilestones } from './milestones.js';
import { startSeason } from './ranking.js';
import { createInvites } from './beta.js';
import { usernameKey } from './db/keys.js';
import { notifications, playerProfiles, users } from './db/schema.js';
import { launchMail, mailLocale, welcomeMail } from './mail/templates.js';
import { createCup, editionAt } from './cup.js';
import { notify } from './routes/notifications.js';
import { mailerFor } from './app.js';
import { SecurityWatch } from './security.js';
import { and, eq, sql } from 'drizzle-orm';
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
    // OG-453: papel só de leitura das estatísticas, usado pelo Alloy no exporter do Postgres
    if (process.env.MONITOR_DB_PASSWORD) {
      const role = process.env.MONITOR_DB_USER ?? 'outgun_monitor';
      await ensureMonitorRole(database.sql, role, process.env.MONITOR_DB_PASSWORD);
      console.log(`papel de monitoramento ${role} conferido`);
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
  } else if (command === 'announce-launch') {
    // Anúncio do 2x2 e da primeira OutCup (S56): abre a edição do mês seguinte (sem o aviso automático de
    // inscrição) e manda o e-mail e o aviso no sino a todas as contas; quem já recebeu o aviso fica de fora.
    // `--dry` só conta.
    const edition = editionAt(new Date(), 1);
    const dry = arg1 === '--dry';
    if (!dry) await createCup(database.db, edition);
    const rows = await database.db
      .select({ id: users.id, email: users.email, username: users.username, language: playerProfiles.language, cupEmails: playerProfiles.cupEmails })
      .from(users)
      .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id));
    const done = new Set(
      (await database.db.select({ userId: notifications.userId }).from(notifications).where(and(eq(notifications.kind, 'cup'), sql`${notifications.data}->>'cupEvent' = 'launch'`))).map((r) => r.userId),
    );
    const todo = rows.filter((r) => !done.has(r.id));
    console.log(`${todo.length} contas a avisar (${done.size} já avisadas), edição ${edition}`);
    if (!dry) {
      const mailer = mailerFor(config);
      let sent = 0;
      for (const u of todo) {
        await notify(database.db, [u.id], 'cup', { cup: edition, cupEvent: 'launch' });
        if (u.cupEmails === false) continue;
        await mailer.send(launchMail(u.email, u.username, config.webUrl, mailLocale(u.language ?? undefined))).then(
          () => sent++,
          (err: unknown) => console.error(`falha no e-mail de ${u.username}:`, err),
        );
        await new Promise((r) => setTimeout(r, 600)); // limite de envios por segundo do Resend
      }
      console.log(`avisos no sino: ${todo.length}; e-mails enviados: ${sent}`);
    }
  } else if (command === 'milestones') {
    // Marcos retroativos (OG-213): idempotente, pode rodar de novo a qualquer momento.
    const r = await backfillMilestones(database.db, { beta: config.beta });
    console.log(`marcos: ${r.added} novos em ${r.users} contas`);
  } else if (command === 'milestones-calibrate') {
    // Calibração dos marcos (OG-398): quantas contas teriam cada um, sem gravar nada.
    const r = await calibrateMilestones(database.db, { beta: config.beta });
    console.log(`contas ativas (30 dias): ${r.active}`);
    for (const row of r.rows) console.log(`${row.id.padEnd(28)} ${String(row.users).padStart(6)}  ${(row.share * 100).toFixed(2)}%`);
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
  } else if (command === 'alert-test') {
    // Um e-mail de teste de cada alerta (OG-313) para ALERT_EMAIL, pelo MAILER do ambiente.
    if (!config.alertEmail) {
      console.error('ALERT_EMAIL vazio: nada a enviar');
      process.exitCode = 1;
    } else {
      const watch = new SecurityWatch({ mailer: mailerFor(config), to: config.alertEmail, log: { info: console.log, warn: console.log, error: console.error } as never, domain: new URL(config.webUrl).host });
      const cases: [string, string][] = [
        ['TESTE: pico de falhas de login', 'Assim chega o alerta quando há mais de 50 falhas de login em 10 minutos.'],
        ['TESTE: disco cheio', 'Assim chega o alerta quando o disco do servidor passa de 80%.'],
        ['TESTE: backup atrasado', 'Assim chega o alerta quando o backup diário do banco não aparece há mais de 26 horas.'],
      ];
      for (const [title, body] of cases) console.log(`${title}: ${(await watch.alert('test', title, body)) ? 'enviado' : 'não enviado'}`);
    }
  } else {
    console.error('uso: cli.js migrate up|down [N]|status | seed | openapi [arquivo] | season start NOME | ticket-key [kid] | invite [usos] [observação] | role NOME admin|moderator|player | welcome NOME | alert-test');
    process.exitCode = 2;
  }
} finally {
  await database.close();
}
