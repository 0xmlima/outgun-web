// SPDX-License-Identifier: GPL-2.0-or-later
// Estudo do WebTransport (OG-376): o que a perda de pacotes faz com o atraso do jogo em TCP (o
// WebSocket de hoje: um pacote perdido segura os seguintes até a retransmissão) e em datagramas
// (UDP, como os datagramas do WebTransport: o perdido some e o seguinte passa). Tráfego no ritmo do
// Outgun: quadros do servidor a 10 Hz (~400 bytes) e comandos do cliente a 20/s com os 3 últimos
// repetidos em cada datagrama (o servidor aceita por sequência, OG-370). Mede o "atraso até ter o
// dado": de quando o quadro/comando sai até chegar ele ou um mais novo que o substitui.
// Rodar num Linux com a perda no loopback (precisa de NET_ADMIN no container):
//   tc qdisc add dev lo root netem delay 40ms 5ms loss 2%
//   node tools/load/transport-loss.mjs tcp 45 && node tools/load/transport-loss.mjs udp 45
import { createSocket } from 'node:dgram';
import { createConnection, createServer } from 'node:net';
import { performance } from 'node:perf_hooks';

const [mode = 'tcp', seconds = '30'] = process.argv.slice(2);
const DURATION = Number(seconds) * 1000;
const FRAME_MS = 100;
const INPUT_MS = 50;
const FRAME_BYTES = 400;
const PORT_A = 47011;
const PORT_B = 47012;

const frameSent = new Map();
const inputSent = new Map();
const frameLag = [];
const inputLag = [];
let frameGot = -1;
let inputGot = -1;

/** Chegou o quadro/comando `seq`: fecha o atraso de todos até ele que ainda esperavam. */
function arrived(seq, sent, lags, lastRef) {
  const now = performance.now();
  for (let s = lastRef + 1; s <= seq; s++) {
    const t = sent.get(s);
    if (t !== undefined) {
      lags.push(now - t);
      sent.delete(s);
    }
  }
  return Math.max(lastRef, seq);
}

const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};
const summary = (xs) => ({
  n: xs.length,
  p50: pct(xs, 50),
  p95: pct(xs, 95),
  p99: pct(xs, 99),
  max: pct(xs, 100),
  over200ms: xs.filter((x) => x > 200).length,
});

async function runTcp() {
  // quadros com tamanho na frente (o WebSocket só acrescenta o cabeçalho do frame)
  const decoder = (onMessage) => {
    let buf = Buffer.alloc(0);
    return (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (buf.length < 4 + len) break;
        onMessage(buf.subarray(4, 4 + len));
        buf = buf.subarray(4 + len);
      }
    };
  };
  const frame = (payload) =>
    Buffer.concat([
      Buffer.from([0, 0, (payload.length >> 8) & 255, payload.length & 255]),
      payload,
    ]);
  await new Promise((resolve) => {
    const server = createServer((sock) => {
      sock.setNoDelay(true);
      sock.on(
        'data',
        decoder((m) => (inputGot = arrived(m.readUInt32BE(0), inputSent, inputLag, inputGot))),
      );
      let seq = 0;
      const timer = setInterval(() => {
        const p = Buffer.alloc(FRAME_BYTES);
        p.writeUInt32BE(seq, 0);
        frameSent.set(seq++, performance.now());
        sock.write(frame(p));
      }, FRAME_MS);
      setTimeout(() => {
        clearInterval(timer);
        sock.destroy();
        server.close();
        resolve();
      }, DURATION);
    }).listen(PORT_A, '127.0.0.1', () => {
      const c = createConnection(PORT_A, '127.0.0.1');
      c.setNoDelay(true);
      c.on(
        'data',
        decoder((m) => (frameGot = arrived(m.readUInt32BE(0), frameSent, frameLag, frameGot))),
      );
      c.on('error', () => undefined);
      let seq = 0;
      const timer = setInterval(() => {
        const p = Buffer.alloc(32);
        p.writeUInt32BE(seq, 0);
        inputSent.set(seq++, performance.now());
        if (!c.destroyed) c.write(frame(p));
      }, INPUT_MS);
      setTimeout(() => clearInterval(timer), DURATION);
    });
  });
}

async function runUdp() {
  const server = createSocket('udp4');
  const client = createSocket('udp4');
  await Promise.all([
    new Promise((r) => server.bind(PORT_A, '127.0.0.1', r)),
    new Promise((r) => client.bind(PORT_B, '127.0.0.1', r)),
  ]);
  server.on('message', (m) => {
    // comandos: os 3 mais recentes no mesmo datagrama
    for (let i = 0; i + 4 <= m.length; i += 4)
      inputGot = arrived(m.readUInt32BE(i), inputSent, inputLag, inputGot);
  });
  client.on(
    'message',
    (m) => (frameGot = arrived(m.readUInt32BE(0), frameSent, frameLag, frameGot)),
  );
  let fseq = 0;
  let iseq = 0;
  const frames = setInterval(() => {
    const p = Buffer.alloc(FRAME_BYTES);
    p.writeUInt32BE(fseq, 0);
    frameSent.set(fseq++, performance.now());
    server.send(p, PORT_B, '127.0.0.1');
  }, FRAME_MS);
  const inputs = setInterval(() => {
    inputSent.set(iseq, performance.now());
    const p = Buffer.alloc(12);
    for (let k = 0; k < 3; k++) p.writeUInt32BE(Math.max(0, iseq - k), k * 4);
    iseq++;
    client.send(p, PORT_A, '127.0.0.1');
  }, INPUT_MS);
  await new Promise((r) => setTimeout(r, DURATION));
  clearInterval(frames);
  clearInterval(inputs);
  await new Promise((r) => setTimeout(r, 500));
  server.close();
  client.close();
}

await (mode === 'udp' ? runUdp() : runTcp());
console.log(
  JSON.stringify({
    mode,
    seconds: Number(seconds),
    frames: summary(frameLag),
    inputs: summary(inputLag),
    framesNeverArrived: frameSent.size,
    inputsNeverArrived: inputSent.size,
  }),
);
