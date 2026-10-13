// SPDX-License-Identifier: GPL-2.0-or-later
// Ponto de entrada: `node dist/main.js`. Variáveis em apps/api/README.md. Aplica as migrations
// pendentes antes de abrir a porta (MIGRATE=0 desliga).
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connect } from './db/client.js';
import { migrateUp } from './db/migrate.js';
import { connectRedis } from './redis.js';

const config = loadConfig();
const database = connect(config.databaseUrl);
if (process.env.MIGRATE !== '0') await migrateUp(database.sql);
const redis = connectRedis(config.redisUrl);
const app = await buildApp({ config, database, redis });
await app.listen({ port: config.port, host: config.host });

const shutdown = async () => {
  await app.close();
  redis?.disconnect();
  await database.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
