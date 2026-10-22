// SPDX-License-Identifier: GPL-2.0-or-later
// Spike OG-375 (D-74): quanto a física muda com passos menores que 1 frame e quanto custa um
// servidor acima de 10 Hz. Reaproveitável: `node tools/dev/tick-spike.mjs` (com o game server compilado).
//
// Física: modelo do `applyPlayerAcceleration` (packages/sim/src/world/physics.ts) em campo aberto,
// com as constantes do Clássico. Paredes e foguetes não entram: o movimento entre colisões já é
// contínuo na sim (tempo até a parede), então só a aceleração por frame muda com o passo.
//   - 10 Hz: um passo de 1 frame (o jogo hoje);
//   - passo h "ingênuo": drag (1-d)^h, atrito f·h, aceleração a·h (o que sai de dividir tudo por 2);
//   - passo h "calibrado": drag 1-d·h, atrito f·h, aceleração a·h (mesma velocidade máxima de hoje).
// CPU e banda: uma sala de verdade (Room) com 1 humano + 15 bots, 60 s de jogo.
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const { presetSettings } = await import(`${repo}packages/settings/dist/index.js`);
const physics = presetSettings('classic').physics;
const accel = physics.acceleration * physics.runMul; // correndo (o comum numa partida)

/** Um passo de duração h (frames) com a direção `dir` (vetor unitário ou zero). */
function step(s, dir, h, mode) {
  const drag = h === 1 ? 1 - physics.drag : mode === 'naive' ? Math.pow(1 - physics.drag, h) : 1 - physics.drag * h;
  let vx = s.vx * drag;
  let vy = s.vy * drag;
  const spd = Math.hypot(vx, vy);
  const f = physics.friction * h;
  if (spd <= f || spd < 0.001) vx = vy = 0;
  else {
    vx *= 1 - f / spd;
    vy *= 1 - f / spd;
  }
  vx += dir[0] * accel * h;
  vy += dir[1] * accel * h;
  return { x: s.x + vx * h, y: s.y + vy * h, vx, vy };
}

/** Roda `frames` frames; `input(t)` dá a direção no instante t (em frames); `sub` passos por frame. */
function run(frames, input, sub, mode, start = { x: 0, y: 0, vx: 0, vy: 0 }) {
  let s = { ...start };
  const out = [s];
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < sub; k++) s = step(s, input(f + k / sub), 1 / sub, mode);
    out.push(s);
  }
  return out;
}

/** Input que chega no instante `tau` do frame (0..1) e vale dali em diante: passos partidos em tau. */
function runSplit(frames, before, after, tau, mode, start) {
  let s = { ...start };
  const out = [s];
  for (let f = 0; f < frames; f++) {
    if (f === 0 && tau > 0) {
      s = step(s, before, tau, mode);
      s = step(s, after, 1 - tau, mode);
    } else s = step(s, after, 1, mode);
    out.push(s);
  }
  return out;
}

const R = [1, 0];
const UR = [Math.SQRT1_2, -Math.SQRT1_2];
const NONE = [0, 0];
const speed = (s) => Math.hypot(s.vx, s.vy);
const topSpeed = (sub, mode) => speed(run(200, () => R, sub, mode).at(-1));
const timeTo = (traj, v) => traj.findIndex((s) => speed(s) >= v) / 10;
const dev = (a, b) => Math.max(...a.map((s, i) => Math.hypot(s.x - b[i].x, s.y - b[i].y)));

const top10 = topSpeed(1);
const atTop = { x: 0, y: 0, vx: top10, vy: 0 };
const maneuvers = [
  ['Arrancada (2 s para a direita)', (sub, mode) => run(20, () => R, sub, mode)],
  ['Diagonal (2 s, cima+direita)', (sub, mode) => run(20, () => UR, sub, mode)],
  ['Frenagem (solta tudo na velocidade máxima)', (sub, mode) => run(20, () => NONE, sub, mode, atTop)],
  ['Curva (na máxima para a direita, vira para cima)', (sub, mode) => run(20, () => [0, -1], sub, mode, atTop)],
];

const lines = [];
const log = (s = '') => lines.push(s);
log('## Física (posição em unidades; uma sala tem 640 × 460)');
log();
log(`Velocidade máxima correndo: 10 Hz ${top10.toFixed(2)} u/frame · meio passo ingênuo ${topSpeed(2, 'naive').toFixed(2)} · meio passo calibrado ${topSpeed(2, 'cal').toFixed(2)}`);
const base = run(40, () => R, 1);
log(`Tempo até 95% da máxima: 10 Hz ${timeTo(base, 0.95 * top10)} s · ingênuo ${timeTo(run(40, () => R, 2, 'naive'), 0.95 * top10)} s · calibrado ${timeTo(run(40, () => R, 2, 'cal'), 0.95 * top10)} s`);
log();
log('| Manobra | Meio passo ingênuo (desvio máx.) | Meio passo calibrado (desvio máx.) | Input no subpasso (desvio máx., chegada no meio do frame) |');
log('|---|---|---|---|');
for (const [name, fn] of maneuvers) {
  const ref = fn(1);
  const split = name.startsWith('Frenagem')
    ? runSplit(20, R, NONE, 0.5, 'cal', atTop)
    : name.startsWith('Curva')
      ? runSplit(20, R, [0, -1], 0.5, 'cal', atTop)
      : runSplit(20, NONE, name.startsWith('Diagonal') ? UR : R, 0.5, 'cal', { x: 0, y: 0, vx: 0, vy: 0 });
  log(`| ${name} | ${dev(fn(2, 'naive'), ref).toFixed(1)} u | ${dev(fn(2, 'cal'), ref).toFixed(1)} u | ${dev(split, ref).toFixed(1)} u |`);
}
const stopDist = (sub, mode) => run(40, () => NONE, sub, mode, atTop).at(-1).x;
log();
log(`Distância de frenagem: 10 Hz ${stopDist(1).toFixed(1)} u · ingênuo ${stopDist(2, 'naive').toFixed(1)} u · calibrado ${stopDist(2, 'cal').toFixed(1)} u`);
log('Foguetes (velocidade constante) e quiques em parede (tempo contínuo até a parede): sem desvio.');

// --- CPU e banda numa sala de verdade ---
const { loadMaps } = await import(`${repo}apps/game-server/dist/maps.js`);
const { Room } = await import(`${repo}apps/game-server/dist/room.js`);
const { message } = await import(`${repo}packages/protocol/dist/index.js`);
const [map] = loadMaps(`${repo}_legacy/maps`, ['outgun1']);
const room = new Room({ id: 'spike', preset: 'classic', maps: [map], maxPlayers: 16, seed: 7 });
let bytes = 0;
const human = room.join({ send: (d) => (bytes += d.length), close() {} }, { name: 'Medidor', accountId: null });
room.handle(human.pid, [message('clientReady', {})]);
for (let i = 0; i < 15; i++) room.addBot();
for (let f = 0; f < 100; f++) room.tick(); // aquecimento
bytes = 0;
const times = [];
for (let f = 0; f < 600; f++) {
  room.handle(human.pid, [message('input', { clientFrame: f & 255, controls: 1 + (f % 15), gundir: f % 16 })]);
  const t0 = performance.now();
  room.tick();
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const mean = times.reduce((a, b) => a + b, 0) / times.length;
log();
log('## Custo (sala outgun1, 1 humano + 15 bots, 60 s)');
log();
log(`Tick da sala: média ${mean.toFixed(2)} ms · p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms (orçamento a 10 Hz: 100 ms; a 20 Hz: 50 ms)`);
log(`Banda para o humano: ${(bytes / 60 / 1024).toFixed(1)} KB/s a 10 Hz → ~${((2 * bytes) / 60 / 1024).toFixed(1)} KB/s a 20 Hz (frames dobram; subpassos a 10 Hz não mudam a banda)`);
console.log(lines.join('\n'));
