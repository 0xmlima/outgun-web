// SPDX-License-Identifier: GPL-2.0-or-later
// Ponto de entrada: `node dist/main.js`. Variáveis em apps/api/README.md. Aplica as migrations
// pendentes antes de abrir a porta (MIGRATE=0 desliga).
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connect } from './db/client.js';
import { migrateUp } from './db/migrate.js';
import { rollSeason } from './ranking.js';
import { connectRedis } from './redis.js';

const config = loadConfig();
const database = connect(config.databaseUrl);
if (process.env.MIGRATE !== '0') await migrateUp(database.sql);
const redis = connectRedis(config.redisUrl);
const lifecycle = { stopping: false };

/** Temporadas mensais (OG-267): confere a virada ao subir e a cada minuto (idempotente). */
const checkSeason = () =>
  rollSeason(database.db).then(
    (season) => season && app.log.info({ season }, 'temporada nova aberta'),
    (err: unknown) => app.log.error({ err }, 'falha na virada da temporada'),
  );
const app = await buildApp({ config, database, redis, lifecycle });
await app.listen({ port: config.port, host: config.host });
await checkSeason();
const seasonTimer = setInterval(() => void checkSeason(), 60_000);
if (process.env.NODE_ENV === 'production' && !config.metricsToken) app.log.warn('METRICS_TOKEN vazio: /metrics aberto; deixe a porta só na rede interna ou defina o token');

/**
 * Deploy sem queda (OG-103): no SIGTERM o /health passa a dar 503 e, depois de SHUTDOWN_GRACE_S
 * (5 s, o balanceador já parou de mandar pedidos), o Fastify fecha esperando os pedidos em andamento.
 */
let stopping = false;
const shutdown = async (graceS: number) => {
  if (stopping) return;
  stopping = true;
  lifecycle.stopping = true;
  clearInterval(seasonTimer);
  if (graceS > 0) await new Promise((r) => setTimeout(r, graceS * 1000));
  await app.close();
  redis?.disconnect();
  await database.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(Number(process.env.SHUTDOWN_GRACE_S ?? 5)));
