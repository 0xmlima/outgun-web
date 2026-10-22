// SPDX-License-Identifier: GPL-2.0-or-later
// Ponto de entrada: `node dist/main.js`. Variáveis: PORT (7700; a 7000 é do AirPlay no macOS), MAPS_DIR (_legacy/maps/ do repositório),
// ROTATION (outgun1), PRESET (classic), MAX_PLAYERS (16), DEV_TICKETS (1 = aceita dev:Nome; padrão 1 fora de produção e 0 com NODE_ENV=production),
// TICKET_JWKS_URL (chaves dos tickets da API; padrão http://localhost:7800/.well-known/jwks.json),
// API_URL (http://localhost:7800), GS_ID e GS_SECRET (assinatura das rotas internas; padrão dev),
// CHAT_FILTER (palavras trocadas por * no chat, separadas por vírgula), TRUST_PROXY (1 = X-Forwarded-For),
// EMPTY_TIMEOUT_S (300), PUBLIC_WS_URL (endereço anunciado à API; ws://localhost:PORT), REGION (local),
// MAX_ROOMS (50), RANKED_ROTATION (rotação oficial do Ranked; padrão ROTATION), HEARTBEAT (0 = não registra na API),
// CASUAL_BOTS_FILL (bots_fill das salas Casual; padrão 0), REPLAYS (0 = não grava), REPLAY_DIR (var/replays do
// repositório), REPLAY_PUBLIC_URL (padrão http://<PUBLIC_WS_URL>/replays), REPLAY_RETENTION_DAYS (30; 0 = para sempre),
// MAX_SPECTATORS (espectadores ao vivo por sala; 16), GAMEMOD (linhas de gamemod para todas as salas, separadas por |).
// Observabilidade (OG-102): LOG_LEVEL (info), METRICS_TOKEN (exige Bearer em /metrics), SENTRY_DSN (erros),
// SENTRY_ENVIRONMENT (padrão NODE_ENV), RELEASE (versão nos logs e erros).
// MAX_CONNECTIONS_PER_IP (8; 0 = sem limite).
// INSTANCE_ID (padrão FLY_MACHINE_ID): salas também em /m/<id>/rooms/...; `{instance}` em PUBLIC_WS_URL vira esse id.
// MAPGEN_DIR (_legacy/mapgen/ do repositório): blocos de paredes dos mapas `random_map` da rotação (OG-015).
// DRAIN_TIMEOUT_S (240): prazo da drenagem no SIGTERM.
// SEED: semente fixa das salas (capturas determinísticas do `pnpm visual:check`, OG-265); padrão aleatória.
// ROOMS: salas fixas além da `main`, `id[:preset[:max_jogadores]]` separadas por vírgula (testes de carga, OG-101).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listMaps, resolveRotation, type Rotations } from './maps.js';
import { GeneratedMaps } from './generated-maps.js';
import { RoomManager } from './rooms.js';
import { startServer } from './server.js';
import { JwksKeys } from './tickets.js';
import { wordSet } from './chat.js';
import { PlatformClient } from './platform.js';
import { makeSpawner, mapLoader } from './spawn.js';
import { AdminPanelLink } from './panel.js';
import { ReplayStore } from './replay.js';
import { createLogger, ErrorReporter } from '@outgun/observability';
import { GameTelemetry } from './telemetry.js';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const env = process.env;
// mapas aleatórios da rotação (OG-015): blocos de paredes de mapgen/ do jogo (MAPGEN_DIR)
const generatedMaps = new GeneratedMaps(env.MAPGEN_DIR ?? `${repo}_legacy/mapgen`);
const production = env.NODE_ENV === 'production';
const logger = createLogger({ service: 'game-server', level: env.LOG_LEVEL ?? 'info', ...(env.RELEASE ? { version: env.RELEASE } : {}) });
const reporter = new ErrorReporter({ dsn: env.SENTRY_DSN, service: 'game-server', environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV, release: env.RELEASE });
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'exceção não tratada');
  reporter.capture(error, { level: 'fatal' });
  void reporter.flush().finally(() => process.exit(1));
});
process.on('unhandledRejection', (error) => {
  logger.error({ err: error }, 'promise rejeitada sem tratamento');
  reporter.capture(error);
});
// as métricas dependem do gerenciador, criado depois dos callbacks que contam erros
const metrics: { telemetry?: GameTelemetry } = {};
const platform = new PlatformClient(
  env.API_URL ?? 'http://localhost:7800',
  // `{instance}` em GS_ID (ex. gs-gru.{instance}): uma entrada no registro por máquina, segredo do grupo
  (env.GS_ID ?? 'dev').replace('{instance}', env.INSTANCE_ID ?? env.FLY_MACHINE_ID ?? ''),
  env.GS_SECRET ?? (production ? '' : 'outgun-dev-secret-0000'),
  (t, level = 'error') => {
    if (level === 'info') return logger.info({ component: 'platform' }, t);
    metrics.telemetry?.errors.inc(1, { kind: 'platform' });
    logger.warn({ component: 'platform' }, t);
  },
);
const port = Number(env.PORT ?? 7700);
// várias máquinas no mesmo domínio (Fly, OG-103): `{instance}` em PUBLIC_WS_URL vira o id da máquina
const instanceId = env.INSTANCE_ID ?? env.FLY_MACHINE_ID;
const publicWsUrl = (env.PUBLIC_WS_URL ?? `ws://localhost:${port}`).replace('{instance}', instanceId ?? '');
// replays (OG-090): em disco, servidos em /replays/; a URL vai no relatório da partida
const replays =
  env.REPLAYS === '0' ? undefined : new ReplayStore(env.REPLAY_DIR ?? `${repo}var/replays`, env.REPLAY_PUBLIC_URL ?? `${publicWsUrl.replace(/^ws/, 'http')}/replays`, Number(env.REPLAY_RETENTION_DAYS ?? 30));
const pruneReplays = () => {
  const removed = replays?.prune() ?? 0;
  if (removed > 0) logger.info({ removed }, 'replays apagados pela retenção');
};
pruneReplays();
// resultados que a API recusou ficam no mesmo volume, fora da retenção (só apaga `.ogr`) e do /replays/ (OG-331)
if (replays) platform.keepFailedReports(join(replays.dir, 'failed'));
const pruneTimer = setInterval(pruneReplays, 3_600_000);
pruneTimer.unref();

const manager = new RoomManager({
  emptyTimeoutMs: Number(env.EMPTY_TIMEOUT_S ?? 300) * 1000,
  maxRooms: Number(env.MAX_ROOMS ?? 50),
  ...(env.SEED ? { seed: () => Number(env.SEED) } : {}),
  roomDefaults: {
    audit: (roomId, entry) => {
      logger.info({ room: roomId, action: entry.action, actor: entry.actor.name, target: entry.target?.name, reason: entry.reason }, 'ação de moderação');
      platform.audit(roomId, entry);
    },
    reportMatch: (report) => {
      logger.info({ room: report.roomId, map: report.map, red: report.redScore, blue: report.blueScore, ranked: report.ranked }, 'fim de partida');
      platform.reportMatch(report);
    },
    reportPlayer: (report) => {
      logger.info({ room: report.roomId, reporter: report.reporter.name, target: report.target.name, reason: report.reason }, 'denúncia de jogador');
      platform.reportPlayer(report);
    },
    chatFilter: wordSet((env.CHAT_FILTER ?? '').split(',')),
    log: (line) => logger.info(line),
    onMisbehavior: (kick) => {
      metrics.telemetry?.errors.inc(1, { kind: 'misbehavior' });
      logger.warn({ name: kick.name, ip: kick.ip, reason: kick.reason }, 'jogador expulso por mensagem inválida');
    },
    // `bots_fill` das salas Casual (OG-054); o preset Clássico tem 0
    ...(env.CASUAL_BOTS_FILL ? { botsFill: Number(env.CASUAL_BOTS_FILL) } : {}),
    ...(replays ? { replays } : {}),
    maxSpectators: Number(env.MAX_SPECTATORS ?? 16),
    ...(env.GAMEMOD ? { gamemod: env.GAMEMOD.split('|').join('\n') } : {}),
    generatedMaps,
  },
});
const rotation = (env.ROTATION ?? 'outgun1').split(',');
// rotação oficial de cada modo; o painel admin (OG-087) pode trocá-la pela resposta do heartbeat
// (os formatos do Ranked usam a `ranked` até o painel mandar a deles, OG-251)
const rotations: Rotations = { casual: rotation, ranked: env.RANKED_ROTATION ? env.RANKED_ROTATION.split(',') : rotation };
const mapsDir = env.MAPS_DIR ?? `${repo}_legacy/maps`;
// `random_map L A ...` na rotação (OG-015): mapas gerados com os blocos de mapgen/
const mapFile = mapLoader(mapsDir);
const fixedRoom = (id: string, name: string, preset: string, maxPlayers: number) => {
  const slots = resolveRotation(rotation, mapFile, generatedMaps);
  if (slots.length === 0) throw new Error(`rotação sem mapas válidos: ${rotation.join(', ')}`);
  manager.create({
    id,
    name,
    preset,
    maps: slots.map((s) => s.map),
    mapFiles: slots.map((s) => s.file),
    ...(slots.some((s) => s.random) ? { randomSlots: slots.map((s) => s.random ?? null) } : {}),
    maxPlayers,
    persistent: true,
  });
};
const telemetry = new GameTelemetry(manager, logger, reporter);
metrics.telemetry = telemetry;
manager.observer = telemetry;
fixedRoom('main', 'Principal', env.PRESET ?? 'classic', Number(env.MAX_PLAYERS ?? 16));
for (const spec of (env.ROOMS ?? '').split(',').filter(Boolean)) {
  const [id = '', preset = env.PRESET ?? 'classic', max = env.MAX_PLAYERS ?? '16'] = spec.split(':');
  fixedRoom(id, id, preset, Number(max));
}
manager.start();

const jwks = new JwksKeys(env.TICKET_JWKS_URL ?? 'http://localhost:7800/.well-known/jwks.json', (t) => logger.warn({ component: 'jwks' }, t));
jwks.start();

const server = await startServer({
  spawnRoom: makeSpawner(manager, {
    rotations,
    mapsDir,
    generatedMaps,
    log: (line) => logger.info(line),
  }),
  ticketKeys: () => jwks.keys,
  trustProxy: env.TRUST_PROXY === '1',
  port,
  manager,
  // tickets `dev:` entram sem passar pela API (sem ban, senha nem conferência de nome): nunca em produção por padrão (OG-104)
  devTickets: env.DEV_TICKETS ? env.DEV_TICKETS === '1' : !production,
  protocolDist: `${repo}packages/protocol/dist`,
  devPage: fileURLToPath(new URL('../dev/index.html', import.meta.url)),
  ...(replays ? { replays } : {}),
  telemetry,
  logger,
  generatedMaps,
  ...(instanceId ? { instanceId } : {}),
  ...(env.METRICS_TOKEN ? { metricsToken: env.METRICS_TOKEN } : {}),
  ...(env.MAX_CONNECTIONS_PER_IP ? { maxConnectionsPerIp: Number(env.MAX_CONNECTIONS_PER_IP) } : {}),
  // ALLOWED_ORIGINS: origens do site separadas por vírgula (OG-311); vazio = qualquer
  ...(env.ALLOWED_ORIGINS ? { allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) } : {}),
});
if (production && !env.METRICS_TOKEN) logger.warn('METRICS_TOKEN vazio: /metrics aberto; deixe a porta só na rede interna ou defina o token');
logger.info({ port: server.port }, `game-server na porta ${server.port}; depuração em http://localhost:${server.port}/dev`);
// o heartbeat lê este objeto a cada envio: na drenagem, maxRooms 0 tira o servidor da escolha da API
const serverInfo = { wsBaseUrl: publicWsUrl, region: env.REGION ?? env.FLY_REGION ?? 'local', maxRooms: manager.maxRooms, maps: listMaps(mapsDir) };
const panel = new AdminPanelLink({ manager, rotations, map: mapFile, generatedMaps, log: (msg, fields) => logger.info({ component: 'painel', ...fields }, msg) });
if (env.HEARTBEAT !== '0') platform.startHeartbeat(serverInfo, () => manager.hosted(), 3000, panel);

let stopping = false;
/**
 * SIGTERM (deploy, OG-103): drena — sem salas novas, cada sala fecha no fim da partida em
 * andamento, até DRAIN_TIMEOUT_S; SIGINT (Ctrl+C) para na hora. Nos dois casos quem ainda está nas
 * salas sai com os deltas do ranking enviados (`stop()` do original).
 */
const shutdown = async (drain: boolean) => {
  if (stopping) return;
  stopping = true;
  if (drain) {
    serverInfo.maxRooms = 0;
    const timeoutS = Number(env.DRAIN_TIMEOUT_S ?? 240);
    logger.info({ rooms: manager.list().length, timeoutS }, 'drenando: as salas fecham no fim da partida');
    await manager.drain(timeoutS * 1000);
  } else manager.stop();
  platform.stopHeartbeat();
  jwks.stop();
  server.close();
  await platform.drain();
  await reporter.flush();
  logger.info('game-server encerrado');
  process.exit(0);
};
process.on('SIGINT', () => void shutdown(false));
process.on('SIGTERM', () => void shutdown(true));
