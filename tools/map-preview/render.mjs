// SPDX-License-Identifier: GPL-2.0-or-later
// Desenha um mapa em SVG a partir do parser do port (validação visual do OG-010 e referência para
// o renderer do OG-061). Uso: pnpm map:preview ARQUIVO.txt [saída.svg] [--scale 0.3]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseMapFile } from '../../packages/content/dist/index.js';

const ROOM_W = 472;
const ROOM_H = 354;

const args = process.argv.slice(2);
const scaleIndex = args.indexOf('--scale');
const scale = scaleIndex >= 0 ? Number(args.splice(scaleIndex, 2)[1]) : 0.3;
const [input, output = `${basename(input ?? 'mapa', '.txt')}.svg`] = args;
if (!input) {
  console.error('uso: pnpm map:preview ARQUIVO.txt [saída.svg] [--scale 0.3]');
  process.exit(2);
}

const result = parseMapFile(input, readFileSync(input));
if (!result.ok) {
  console.error(result.errors.join('\n'));
  process.exit(1);
}
const map = result.map;

// Cores aproximadas das texturas padrão (doc/maps.html).
const FLOOR = [
  '#20331f',
  '#283a26',
  '#1d2b33',
  '#4a1c1c',
  '#1c2650',
  '#9fc5d6',
  '#b9a46a',
  '#5a4630',
];
const WALL = [
  '#3fae3f',
  '#4fbf4f',
  '#2f8f6f',
  '#c03a3a',
  '#3a5ac0',
  '#8a8f99',
  '#8a5a2b',
  '#b04fb0',
];
const TEAM = ['#e03030', '#3060f0', '#30d030'];

const f = (n) => Number(n.toFixed(2));

/** Ponto no ângulo do mapa: 0° = topo, sentido horário. */
function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

function shape(wall, ox, oy, fill) {
  if (wall.kind === 'rect') {
    return `<rect x="${f(ox + wall.a)}" y="${f(oy + wall.b)}" width="${f(wall.c - wall.a)}" height="${f(wall.d - wall.b)}" fill="${fill}"/>`;
  }
  if (wall.kind === 'tri') {
    const pts = [wall.p1, wall.p2, wall.p3].map((p) => `${f(ox + p.x)},${f(oy + p.y)}`).join(' ');
    return `<polygon points="${pts}" fill="${fill}"/>`;
  }
  const cx = ox + wall.center.x;
  const cy = oy + wall.center.y;
  const [a0, a1] = wall.angles;
  if (a0 === a1) {
    // Disco ou anel completo (anel desenhado com regra evenodd).
    const ring = (r) =>
      `M ${f(cx - r)} ${f(cy)} a ${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a ${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0 Z`;
    return `<path d="${ring(wall.ro)} ${wall.ri > 0 ? ring(wall.ri) : ''}" fill="${fill}" fill-rule="evenodd"/>`;
  }
  const sweep = (((a1 - a0) % 360) + 360) % 360;
  const large = sweep > 180 ? 1 : 0;
  const [ox0, oy0] = polar(cx, cy, wall.ro, a0);
  const [ox1, oy1] = polar(cx, cy, wall.ro, a1);
  if (wall.ri > 0) {
    const [ix1, iy1] = polar(cx, cy, wall.ri, a1);
    const [ix0, iy0] = polar(cx, cy, wall.ri, a0);
    return `<path d="M ${f(ox0)} ${f(oy0)} A ${f(wall.ro)} ${f(wall.ro)} 0 ${large} 1 ${f(ox1)} ${f(oy1)} L ${f(ix1)} ${f(iy1)} A ${f(wall.ri)} ${f(wall.ri)} 0 ${large} 0 ${f(ix0)} ${f(iy0)} Z" fill="${fill}"/>`;
  }
  return `<path d="M ${f(cx)} ${f(cy)} L ${f(ox0)} ${f(oy0)} A ${f(wall.ro)} ${f(wall.ro)} 0 ${large} 1 ${f(ox1)} ${f(oy1)} Z" fill="${fill}"/>`;
}

const width = map.width * ROOM_W;
const height = map.height * ROOM_H;
const parts = [];
for (let x = 0; x < map.width; x++) {
  for (let y = 0; y < map.height; y++) {
    const room = map.room({ x, y });
    // Cada sala é recortada no próprio retângulo, como no jogo: formas podem ultrapassar a borda
    // (ex. anéis dos cantos arredondados) e não devem invadir as salas vizinhas.
    const inner = [`<rect width="${ROOM_W}" height="${ROOM_H}" fill="${FLOOR[0]}"/>`];
    for (const g of room.ground) inner.push(shape(g, 0, 0, FLOOR[g.texture] ?? FLOOR[0]));
    for (const w of room.walls) inner.push(shape(w, 0, 0, WALL[w.texture] ?? WALL[0]));
    inner.push(
      `<rect width="${ROOM_W}" height="${ROOM_H}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>`,
    );
    parts.push(
      `<svg x="${x * ROOM_W}" y="${y * ROOM_H}" width="${ROOM_W}" height="${ROOM_H}" overflow="hidden">${inner.join('')}</svg>`,
    );
  }
}
const at = (c) => [c.room.x * ROOM_W + c.x, c.room.y * ROOM_H + c.y];
map.teams.forEach((team, t) => {
  for (const area of team.respawn) {
    const ox = area.room.x * ROOM_W;
    const oy = area.room.y * ROOM_H;
    parts.push(
      `<rect x="${f(ox + area.x1)}" y="${f(oy + area.y1)}" width="${f(area.x2 - area.x1)}" height="${f(area.y2 - area.y1)}" fill="none" stroke="${TEAM[t]}" stroke-dasharray="8 6" stroke-width="3"/>`,
    );
  }
  for (const s of team.spawn) {
    const [px, py] = at(s);
    parts.push(
      `<circle cx="${f(px)}" cy="${f(py)}" r="15" fill="none" stroke="${TEAM[t]}" stroke-width="3"/>`,
    );
  }
  for (const flag of team.flags) {
    const [px, py] = at(flag);
    parts.push(
      `<circle cx="${f(px)}" cy="${f(py)}" r="15" fill="${TEAM[t]}" stroke="#fff" stroke-width="3"/>`,
    );
  }
});
for (const flag of map.wildFlags) {
  const [px, py] = at(flag);
  parts.push(
    `<circle cx="${f(px)}" cy="${f(py)}" r="15" fill="${TEAM[2]}" stroke="#fff" stroke-width="3"/>`,
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f(width * scale)}" height="${f(height * scale)}" viewBox="0 0 ${width} ${height}">
<title>${map.title} — ${map.author}</title>
${parts.join('\n')}
</svg>
`;
writeFileSync(output, svg);
console.log(`${output}: "${map.title}" ${map.width}x${map.height}, crc ${map.crc}`);
