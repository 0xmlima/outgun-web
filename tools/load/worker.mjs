// SPDX-License-Identifier: GPL-2.0-or-later
// Processo com parte dos clientes da carga (OG-101). Cada cliente entra com ticket `dev:`, responde
// às trocas de mapa e manda controles a 10 Hz como um jogador, passando por uma rede simulada
// (atraso, jitter e perda com retransmissão, como o `?lag=&loss=` do cliente web). A cada 2 s
// manda ao processo pai o que mediu.
import { decodeFrame, encodeFrame, message, PROTOCOL_VERSION } from '@outgun/protocol';
import { SimulatedLink } from '@outgun/netcode';

const config = JSON.parse(process.argv[2]);
const conditions = { rttMs: config.rttMs, jitterMs: config.jitterMs, loss: config.loss };
const now = () => performance.now();

const stats = {
  connected: 0,
  joined: 0,
  closed: 0,
  rejected: {},
  bytes: 0,
  frames: 0,
  maxGapMs: 0,
  sentBytes: 0,
};

class LoadClient {
  constructor(room, name, seed) {
    this.up = new SimulatedLink(conditions, seed);
    this.down = new SimulatedLink(conditions, seed + 7919);
    this.frame = 0;
    this.controls = 0;
    this.gundir = 0;
    this.lastFrameAt = 0;
    this.joined = false;
    this.ws = new WebSocket(`${config.server}/rooms/${room}`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      stats.connected++;
      this.queue(
        message('hello', {
          protocol: PROTOCOL_VERSION,
          ticket: `dev:${name}`,
          client: 'outgun-load',
        }),
      );
    };
    this.ws.onmessage = (e) => {
      const data = new Uint8Array(e.data);
      stats.bytes += data.length;
      this.down.send(data, now());
    };
    this.ws.onclose = () => {
      stats.closed++;
      if (this.joined) stats.joined--;
      this.joined = false;
    };
    this.ws.onerror = () => {};
  }

  queue(...messages) {
    this.up.send(encodeFrame(...messages), now());
  }

  pump(t) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    for (const data of this.up.receive(t)) {
      stats.sentBytes += data.length;
      this.ws.send(data);
    }
    for (const data of this.down.receive(t)) this.handle(data, t);
  }

  handle(data, t) {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    for (const m of r.messages) {
      if (m.type === 'welcome') {
        this.joined = true;
        stats.joined++;
      } else if (m.type === 'reject')
        stats.rejected[m.reason] = (stats.rejected[m.reason] ?? 0) + 1;
      else if (m.type === 'mapChange') this.queue(message('clientReady', {}));
      else if (m.type === 'frame') {
        stats.frames++;
        if (this.lastFrameAt) stats.maxGapMs = Math.max(stats.maxGapMs, t - this.lastFrameAt);
        this.lastFrameAt = t;
      }
    }
  }

  /** Um frame de controles: muda de ideia a cada ~1 s e atira às vezes. */
  input() {
    if (!this.joined) return;
    if (Math.random() < 0.1) {
      this.controls = Math.floor(Math.random() * 16);
      this.gundir = Math.floor(Math.random() * 2048);
      this.queue(message('fire', { on: Math.random() < 0.4 }));
    }
    this.frame = (this.frame + 1) & 255;
    this.queue(
      message('input', { clientFrame: this.frame, controls: this.controls, gundir: this.gundir }),
    );
  }
}

const clients = [];
let next = 0;
// entra aos poucos (como jogadores chegando), não todos no mesmo milissegundo
const ramp = setInterval(() => {
  for (let i = 0; i < config.rampPerTick && next < config.players.length; i++, next++) {
    const p = config.players[next];
    clients.push(new LoadClient(p.room, p.name, config.seed + next * 31));
  }
  if (next >= config.players.length) clearInterval(ramp);
}, 100);

setInterval(() => {
  const t = now();
  for (const c of clients) c.pump(t);
}, 5);
setInterval(() => {
  for (const c of clients) c.input();
}, 100);
setInterval(() => {
  process.send?.({ ...stats, rejected: { ...stats.rejected } });
  stats.maxGapMs = 0;
}, 2000);
process.on('message', (m) => {
  if (m === 'stop') {
    for (const c of clients) c.ws.close();
    setTimeout(() => process.exit(0), 200);
  }
});
