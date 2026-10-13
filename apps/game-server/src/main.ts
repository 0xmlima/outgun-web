// SPDX-License-Identifier: GPL-2.0-or-later
// Ponto de entrada: `node dist/main.js`. Variáveis: PORT (7700; a 7000 é do AirPlay no macOS), MAPS_DIR (maps/ do repositório),
// ROTATION (outgun1), PRESET (classic), MAX_PLAYERS (16), DEV_TICKETS (1 = aceita dev:Nome),
// TICKET_JWKS_URL (chaves dos tickets da API; padrão http://localhost:7800/.well-known/jwks.json),
// API_URL (http://localhost:7800), GS_ID e GS_SECRET (assinatura das rotas internas; padrão dev),
// CHAT_FILTER (palavras trocadas por * no chat, separadas por vírgula), TRUST_PROXY (1 = X-Forwarded-For),
// EMPTY_TIMEOUT_S (300), PUBLIC_WS_URL (endereço anunciado à API; ws://localhost:PORT), REGION (local),
// MAX_ROOMS (50), RANKED_ROTATION (rotação oficial do Ranked; padrão ROTATION), HEARTBEAT (0 = não registra na API),
// CASUAL_BOTS_FILL (bots_fill das salas Casual; padrão 0), REPLAYS (0 = não grava), REPLAY_DIR (var/replays do
// repositório), REPLAY_PUBLIC_URL (padrão http://<PUBLIC_WS_URL>/replays), REPLAY_RETENTION_DAYS (30; 0 = para sempre).
import { fileURLToPath } from 'node:url';
import { loadMaps } from './maps.js';
import { RoomManager } from './rooms.js';
import { startServer } from './server.js';
import { JwksKeys } from './tickets.js';
import { wordSet } from './chat.js';
import { PlatformClient } from './platform.js';
import { makeSpawner } from './spawn.js';
import { ReplayStore } from './replay.js';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const env = process.env;
const production = env.NODE_ENV === 'production';
const platform = new PlatformClient(
  env.API_URL ?? 'http://localhost:7800',
  env.GS_ID ?? 'dev',
  env.GS_SECRET ?? (production ? '' : 'outgun-dev-secret-0000'),
  (t) => console.warn(t),
);
const port = Number(env.PORT ?? 7700);
const publicWsUrl = env.PUBLIC_WS_URL ?? `ws://localhost:${port}`;
// replays (OG-090): em disco, servidos em /replays/; a URL vai no relatório da partida
const replays =
  env.REPLAYS === '0' ? undefined : new ReplayStore(env.REPLAY_DIR ?? `${repo}var/replays`, env.REPLAY_PUBLIC_URL ?? `${publicWsUrl.replace(/^ws/, 'http')}/replays`, Number(env.REPLAY_RETENTION_DAYS ?? 30));
const pruneReplays = () => {
  const removed = replays?.prune() ?? 0;
  if (removed > 0) console.log(`[replays] ${removed} apagados pela retenção`);
};
pruneReplays();
const pruneTimer = setInterval(pruneReplays, 3_600_000);
pruneTimer.unref();

const manager = new RoomManager({
  emptyTimeoutMs: Number(env.EMPTY_TIMEOUT_S ?? 300) * 1000,
  maxRooms: Number(env.MAX_ROOMS ?? 50),
  roomDefaults: {
    audit: (roomId, entry) => {
      console.log(`[admin] ${roomId}: ${entry.actor.name} ${entry.action} ${entry.target?.name ?? ''} ${entry.reason}`);
      platform.audit(roomId, entry);
    },
    reportMatch: (report) => {
      console.log(`[partida] ${report.roomId} ${report.map} ${report.redScore}x${report.blueScore}${report.ranked ? ' (ranqueada)' : ''}`);
      platform.reportMatch(report);
    },
    reportDeltas: (report) => platform.reportDeltas(report),
    chatFilter: wordSet((env.CHAT_FILTER ?? '').split(',')),
    log: (line) => console.log(line),
    // `bots_fill` das salas Casual (OG-054); o preset Clássico tem 0
    ...(env.CASUAL_BOTS_FILL ? { botsFill: Number(env.CASUAL_BOTS_FILL) } : {}),
    ...(replays ? { replays } : {}),
  },
});
const rotation = (env.ROTATION ?? 'outgun1').split(',');
const mapsDir = env.MAPS_DIR ?? `${repo}maps`;
const maps = loadMaps(mapsDir, rotation);
manager.create({ id: 'main', name: 'Principal', preset: env.PRESET ?? 'classic', maps, mapFiles: rotation, maxPlayers: Number(env.MAX_PLAYERS ?? 16), persistent: true });
manager.start();

const jwks = new JwksKeys(env.TICKET_JWKS_URL ?? 'http://localhost:7800/.well-known/jwks.json', (t) => console.warn(t));
jwks.start();

const server = await startServer({
  spawnRoom: makeSpawner(manager, {
    mapsDir,
    rotations: { casual: rotation, ranked: env.RANKED_ROTATION ? env.RANKED_ROTATION.split(',') : rotation },
    log: (line) => console.log(line),
  }),
  ticketKeys: () => jwks.keys,
  trustProxy: env.TRUST_PROXY === '1',
  port,
  manager,
  devTickets: env.DEV_TICKETS !== '0',
  protocolDist: `${repo}packages/protocol/dist`,
  devPage: fileURLToPath(new URL('../dev/index.html', import.meta.url)),
  ...(replays ? { replays } : {}),
});
console.log(`game-server na porta ${server.port}; depuração em http://localhost:${server.port}/dev`);
if (env.HEARTBEAT !== '0') {
  platform.startHeartbeat(
    { wsBaseUrl: publicWsUrl, region: env.REGION ?? 'local', maxRooms: manager.maxRooms },
    () => manager.hosted(),
  );
}

const shutdown = async () => {
  platform.stopHeartbeat();
  manager.stop(); // quem está nas salas sai: os deltas do ranking são enviados (`stop()` do original)
  jwks.stop();
  server.close();
  await platform.drain();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
