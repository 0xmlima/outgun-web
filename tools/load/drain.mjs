// SPDX-License-Identifier: GPL-2.0-or-later
// Drenagem do game server no deploy (OG-103), contra a homologação (deploy/staging.sh up com
// GAMEMOD="time_limit 1"): um jogador entra pelo ticket da API, o contêiner recebe SIGTERM e o
// teste confere o aviso, a saída do servidor da escolha da API (maxRooms 0), o fim da partida em
// andamento (placar) sem começar outra, o fechamento da sala e a saída do processo com código 0.
//   node tools/load/drain.mjs [http://localhost:18080]
import { execFileSync } from 'node:child_process';
import { decodeFrame, encodeFrame, message, PROTOCOL_VERSION } from '@outgun/protocol';

const base = process.argv[2] ?? 'http://localhost:18080';
const compose = (...args) =>
  execFileSync(process.env.DOCKER ?? 'docker', ['compose', '-p', 'outgun-staging', ...args], {
    stdio: 'pipe',
  }).toString();
const sql = (q) => compose('exec', '-T', 'postgres', 'psql', '-U', 'outgun', '-tAc', q).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (t) => console.log(`[drenagem] ${Math.round(performance.now() / 1000)} s: ${t}`);
const fail = (t) => {
  console.error(`FALHA: ${t}`);
  process.exit(1);
};

const join = await fetch(`${base}/api/rooms/main/join`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ name: 'Drenagem' }),
});
if (!join.ok) fail(`join ${join.status} ${await join.text()}`);
const { ticket, wsUrl } = await join.json();
const ws = new WebSocket(wsUrl);
ws.binaryType = 'arraybuffer';
const got = [];
let closed = null;
ws.onopen = () =>
  ws.send(
    encodeFrame(message('hello', { protocol: PROTOCOL_VERSION, ticket, client: 'drain-test' })),
  );
ws.onmessage = (e) => {
  const r = decodeFrame(new Uint8Array(e.data), 's2c');
  if (!r.ok) fail(r.error);
  for (const m of r.messages) {
    got.push({ m, at: performance.now() });
    if (m.type === 'mapChange') ws.send(encodeFrame(message('clientReady', {})));
  }
};
ws.onclose = (e) => (closed = { code: e.code, at: performance.now() });
const until = async (pred, ms, what) => {
  const end = performance.now() + ms;
  while (!pred()) {
    if (performance.now() > end) fail(`tempo esgotado: ${what}`);
    await sleep(100);
  }
};
await until(() => got.some((g) => g.m.type === 'welcome'), 10_000, 'welcome');
log('jogador na sala main; SIGTERM no game server');
const sigterm = performance.now();
compose('kill', '-s', 'SIGTERM', 'game-server');

await until(
  () => got.some((g) => g.m.type === 'text' && g.m.text.includes('restarting')),
  5000,
  'aviso de reinício',
);
log(
  'aviso recebido: "The server is restarting: this room will close at the end of the current match."',
);
await sleep(4000);
const maxRooms = sql("SELECT max_rooms FROM game_servers WHERE id = 'staging-gs'");
if (maxRooms !== '0') fail(`heartbeat ainda anuncia ${maxRooms} salas`);
log('API: servidor com max_rooms 0 (fora da escolha para salas novas)');
if (closed) fail('a sala fechou antes do fim da partida');

await until(() => closed !== null, 120_000, 'fechamento da sala');
const over = got.find((g) => g.m.type === 'gameOver');
if (!over) fail('a sala fechou sem mostrar o placar');
if (got.some((g) => g.m.type === 'startGame' && g.at > over.at))
  fail('começou outra partida durante a drenagem');
log(
  `placar ${Math.round((over.at - sigterm) / 1000)} s depois do SIGTERM; sala fechada com código ${closed.code}`,
);
await until(
  () =>
    compose('ps', '-a', '--format', '{{.Service}} {{.State}}', 'game-server').includes('exited'),
  30_000,
  'saída do processo',
);
log(`processo saiu: ${compose('ps', '-a', '--format', '{{.Status}}', 'game-server').trim()}`);
process.exit(0);
