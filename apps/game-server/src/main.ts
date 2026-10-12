// SPDX-License-Identifier: GPL-2.0-or-later
// Ponto de entrada: `node dist/main.js`. Variáveis: PORT (7000), MAPS_DIR (maps/ do repositório),
// ROTATION (outgun1), PRESET (classic), MAX_PLAYERS (16), DEV_TICKETS (1 = aceita dev:Nome),
// EMPTY_TIMEOUT_S (300).
import { fileURLToPath } from 'node:url';
import { loadMaps } from './maps.js';
import { RoomManager } from './rooms.js';
import { startServer } from './server.js';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const env = process.env;
const manager = new RoomManager({ emptyTimeoutMs: Number(env.EMPTY_TIMEOUT_S ?? 300) * 1000 });
const maps = loadMaps(env.MAPS_DIR ?? `${repo}maps`, (env.ROTATION ?? 'outgun1').split(','));
manager.create({ id: 'main', preset: env.PRESET ?? 'classic', maps, maxPlayers: Number(env.MAX_PLAYERS ?? 16), persistent: true });
manager.start();

const server = await startServer({
  port: Number(env.PORT ?? 7000),
  manager,
  devTickets: env.DEV_TICKETS !== '0',
  protocolDist: `${repo}packages/protocol/dist`,
  devPage: fileURLToPath(new URL('../dev/index.html', import.meta.url)),
});
console.log(`game-server na porta ${server.port}; depuração em http://localhost:${server.port}/dev`);

const shutdown = () => {
  manager.stop();
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
