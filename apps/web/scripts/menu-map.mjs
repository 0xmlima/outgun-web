// SPDX-License-Identifier: GPL-2.0-or-later
// Fundo dos menus no tema Campo (OG-291): um mapa de verdade desenhado com as cores de fábrica da
// partida (chão `ground`, paredes `wall`, bandeiras com mastro `flag_pole`). Gera um SVG estático,
// versionado no repositório, para os menus não precisarem carregar o mapa em tempo de execução.
//   node apps/web/scripts/menu-map.mjs [mapa]   (padrão: mooca; grava src/ui/campo-map.svg)
import { readFileSync, writeFileSync } from 'node:fs';
import { parseMapFile } from '@outgun/content';

const ROOM_W = 472;
const ROOM_H = 354;
const GROUND = '#104000';
const WALL = '#30C000';
const POLE = '#FFFF00';
const TEAM = ['#FF3B2B', '#3550FF'];

const name = process.argv[2] ?? 'mooca';
const file = new URL(`../../../_legacy/maps/${name}.txt`, import.meta.url);
const result = parseMapFile(`${name}.txt`, readFileSync(file));
if (!result.ok) throw new Error(`mapa inválido: ${name}`);
const map = result.map;
const r = (n) => Math.round(n);

const walls = [];
for (let rx = 0; rx < map.width; rx++)
  for (let ry = 0; ry < map.height; ry++) {
    const ox = rx * ROOM_W;
    const oy = ry * ROOM_H;
    for (const w of map.rooms[rx][ry].walls) {
      if (w.kind === 'rect')
        walls.push(
          `<rect x="${r(ox + w.a)}" y="${r(oy + w.b)}" width="${r(w.c - w.a)}" height="${r(w.d - w.b)}"/>`,
        );
      else if (w.kind === 'tri')
        walls.push(
          `<polygon points="${[w.p1, w.p2, w.p3].map((p) => `${r(ox + p.x)},${r(oy + p.y)}`).join(' ')}"/>`,
        );
      else
        walls.push(
          `<circle cx="${r(ox + w.center.x)}" cy="${r(oy + w.center.y)}" r="${r(w.ro)}"/>`,
        );
    }
  }

const flags = map.teams.flatMap((team, i) =>
  team.flags.map((p) => {
    const x = r(p.room.x * ROOM_W + p.x);
    const y = r(p.room.y * ROOM_H + p.y);
    return `<circle cx="${x}" cy="${y}" r="120" fill="${TEAM[i]}" opacity=".35"/><rect x="${x - 8}" y="${y - 50}" width="14" height="90" fill="${POLE}"/><rect x="${x + 6}" y="${y - 50}" width="54" height="44" fill="${TEAM[i]}"/>`;
  }),
);

const w = map.width * ROOM_W;
const h = map.height * ROOM_H;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMaxYMid slice"><!-- ${map.title}, de ${map.author}; gerado por apps/web/scripts/menu-map.mjs --><rect width="${w}" height="${h}" fill="${GROUND}"/><g fill="${WALL}">${walls.join('')}</g>${flags.join('')}</svg>\n`;
writeFileSync(new URL('../src/ui/campo-map.svg', import.meta.url), svg);
console.log(`campo-map.svg: ${map.title} (${map.width}×${map.height} salas, ${svg.length} bytes)`);
