// SPDX-License-Identifier: GPL-2.0-or-later
// Fundo dos temas de menu: um mapa de verdade com as cores de fábrica. "campo" (OG-291) como na
// partida (chão `ground`, paredes `wall`, bandeiras com mastro `flag_pole`); "placar" (OG-292) como no
// minimapa (`map_ground`, `map_wall`, bordas `map_room_border` e as bases tingidas). Gera SVGs estáticos,
// versionados no repositório, para os menus não precisarem carregar o mapa em tempo de execução.
//   node apps/web/scripts/menu-map.mjs [mapa]   (padrão: mooca; grava src/ui/campo-map.svg e placar-map.svg)
import { readFileSync, writeFileSync } from 'node:fs';
import { parseMapFile } from '@outgun/content';

const ROOM_W = 472;
const ROOM_H = 354;
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

const bases = map.teams.flatMap((team, i) =>
  team.flags.map((p) => ({
    team: i,
    x: r(p.room.x * ROOM_W + p.x),
    y: r(p.room.y * ROOM_H + p.y),
    rx: p.room.x,
    ry: p.room.y,
  })),
);
const w = map.width * ROOM_W;
const h = map.height * ROOM_H;
const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMaxYMid slice"><!-- ${map.title}, de ${map.author}; gerado por apps/web/scripts/menu-map.mjs -->`;

const campo =
  `${head}<rect width="${w}" height="${h}" fill="#104000"/><g fill="#30C000">${walls.join('')}</g>` +
  bases
    .map(
      ({ team, x, y }) =>
        `<circle cx="${x}" cy="${y}" r="120" fill="${TEAM[team]}" opacity=".35"/><rect x="${x - 8}" y="${y - 50}" width="14" height="90" fill="${POLE}"/><rect x="${x + 6}" y="${y - 50}" width="54" height="44" fill="${TEAM[team]}"/>`,
    )
    .join('') +
  '</svg>\n';

const grid = [
  ...Array.from(
    { length: map.width - 1 },
    (_, i) => `<rect x="${(i + 1) * ROOM_W - 2}" y="0" width="4" height="${h}"/>`,
  ),
  ...Array.from(
    { length: map.height - 1 },
    (_, i) => `<rect x="0" y="${(i + 1) * ROOM_H - 2}" width="${w}" height="4"/>`,
  ),
].join('');
const placar =
  `${head}<rect width="${w}" height="${h}" fill="#000000"/>` +
  bases
    .map(
      ({ team, rx, ry }) =>
        `<rect x="${rx * ROOM_W}" y="${ry * ROOM_H}" width="${ROOM_W}" height="${ROOM_H}" fill="${TEAM[team]}" opacity=".3"/>`,
    )
    .join('') +
  `<g fill="#007700">${walls.join('')}</g><g fill="#303030">${grid}</g>` +
  bases
    .map(
      ({ team, x, y }) =>
        `<rect x="${x - 8}" y="${y - 50}" width="14" height="90" fill="${POLE}"/><rect x="${x + 6}" y="${y - 50}" width="54" height="44" fill="${TEAM[team]}"/>`,
    )
    .join('') +
  '</svg>\n';

for (const [style, svg] of [
  ['campo', campo],
  ['placar', placar],
]) {
  writeFileSync(new URL(`../src/ui/${style}-map.svg`, import.meta.url), svg);
  console.log(
    `${style}-map.svg: ${map.title} (${map.width}×${map.height} salas, ${svg.length} bytes)`,
  );
}
