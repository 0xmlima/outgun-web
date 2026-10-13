// SPDX-License-Identifier: GPL-2.0-or-later
// Utilitários: node dist/cli.js migrate up|down [N]|status, seed, openapi [arquivo], season start NOME, ticket-key [kid].
import { writeFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connect } from './db/client.js';
import { appliedVersions, loadMigrations, migrateDown, migrateUp } from './db/migrate.js';
import { seed } from './db/seed.js';
import { startSeason } from './ranking.js';
import { exportSigningKey, generateSigningKey } from '@outgun/tickets';

const [command, arg1, arg2] = process.argv.slice(2);
const config = loadConfig();
const database = connect(config.databaseUrl, 1);

try {
  if (command === 'migrate' && arg1 === 'up') {
    console.log('aplicadas:', (await migrateUp(database.sql)).join(', ') || 'nenhuma');
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
  } else {
    console.error('uso: cli.js migrate up|down [N]|status | seed | openapi [arquivo] | season start NOME | ticket-key [kid]');
    process.exitCode = 2;
  }
} finally {
  await database.close();
}
