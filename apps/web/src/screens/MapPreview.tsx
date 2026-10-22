// SPDX-License-Identifier: GPL-2.0-or-later
// Prévia do mapa em SVG (OG-214), com o mesmo desenho do `tools/map-preview`: chão e paredes com as
// cores aproximadas das texturas padrão e as bandeiras dos times. Os mapas do jogo vêm dos assets; os
// publicados pela moderação, da API (OG-368). Mapas gerados na hora (OG-015) ficam sem prévia.
import { parseMapFile } from '@outgun/content';
import type { GameMap, Wall } from '@outgun/sim';
import { useEffect, useState } from 'react';
import { API_URL } from '../app/api.js';
import { ASSETS, loadManifest } from '../assets.js';

const ROOM_W = 472;
const ROOM_H = 354;
const FLOOR = ['#20331f', '#283a26', '#1d2b33', '#4a1c1c', '#1c2650', '#9fc5d6', '#b9a46a', '#5a4630'];
const WALL = ['#3fae3f', '#4fbf4f', '#2f8f6f', '#c03a3a', '#3a5ac0', '#8a8f99', '#8a5a2b', '#b04fb0'];
const TEAM = ['var(--text-team-red)', 'var(--text-team-blue)', '#30d030'];

/** Ponto no ângulo do mapa: 0° = topo, sentido horário. */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

function Shape({ wall, fill }: { wall: Wall; fill: string }) {
  if (wall.kind === 'rect') return <rect x={wall.a} y={wall.b} width={wall.c - wall.a} height={wall.d - wall.b} fill={fill} />;
  if (wall.kind === 'tri') return <polygon points={[wall.p1, wall.p2, wall.p3].map((p) => `${p.x},${p.y}`).join(' ')} fill={fill} />;
  const { x: cx, y: cy } = wall.center;
  const [a0, a1] = wall.angles;
  if (a0 === a1) {
    const ring = (r: number) => `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    return <path d={`${ring(wall.ro)} ${wall.ri > 0 ? ring(wall.ri) : ''}`} fill={fill} fillRule="evenodd" />;
  }
  const large = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
  const [ox0, oy0] = polar(cx, cy, wall.ro, a0);
  const [ox1, oy1] = polar(cx, cy, wall.ro, a1);
  if (wall.ri > 0) {
    const [ix1, iy1] = polar(cx, cy, wall.ri, a1);
    const [ix0, iy0] = polar(cx, cy, wall.ri, a0);
    return <path d={`M ${ox0} ${oy0} A ${wall.ro} ${wall.ro} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${wall.ri} ${wall.ri} 0 ${large} 0 ${ix0} ${iy0} Z`} fill={fill} />;
  }
  return <path d={`M ${cx} ${cy} L ${ox0} ${oy0} A ${wall.ro} ${wall.ro} 0 ${large} 1 ${ox1} ${oy1} Z`} fill={fill} />;
}

const cache = new Map<string, Promise<GameMap | null>>();

/** Mapa para a prévia: dos assets do jogo ou, fora deles, publicado pela moderação (API); com cache. */
export function previewMap(name: string): Promise<GameMap | null> {
  let hit = cache.get(name);
  if (!hit) {
    hit = (async () => {
      if (/^mapgen_\d+$/.test(name) || name === 'random' || name.startsWith('random_map')) return null;
      const entry = (await loadManifest())?.maps[name];
      const res = await fetch(entry ? ASSETS + entry.file : `${API_URL}/maps/${encodeURIComponent(name)}`);
      if (!res.ok) return null;
      const result = parseMapFile(name, new Uint8Array(await res.arrayBuffer()));
      return result.ok ? result.map : null;
    })().catch(() => null);
    cache.set(name, hit);
  }
  return hit;
}

function useMap(name: string): GameMap | null {
  const [map, setMap] = useState<GameMap | null>(null);
  useEffect(() => {
    let alive = true;
    setMap(null);
    void previewMap(name).then((m) => alive && setMap(m));
    return () => {
      alive = false;
    };
  }, [name]);
  return map;
}

/** Prévia pelo nome do mapa; `thumb` = miniatura (listas de escolha de mapas). */
export function MapPreview({ name, label, thumb = false }: { readonly name: string; readonly label: string; readonly thumb?: boolean }) {
  const map = useMap(name);
  return map ? <MapDrawing map={map} label={label} thumb={thumb} /> : thumb ? <span className="map-thumb map-thumb-empty" aria-hidden /> : null;
}

/** Desenho de um mapa já carregado (também a prévia do arquivo antes de publicar, OG-368). */
export function MapDrawing({ map, label, thumb = false }: { readonly map: GameMap; readonly label: string; readonly thumb?: boolean }) {
  const rooms = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const room = map.room({ x, y });
      rooms.push(
        <svg key={`${x},${y}`} x={x * ROOM_W} y={y * ROOM_H} width={ROOM_W} height={ROOM_H} overflow="hidden">
          <rect width={ROOM_W} height={ROOM_H} fill={FLOOR[0]} />
          {room.ground.map((g, i) => (
            <Shape key={`g${i}`} wall={g} fill={FLOOR[g.texture] ?? FLOOR[0]!} />
          ))}
          {room.walls.map((w, i) => (
            <Shape key={`w${i}`} wall={w} fill={WALL[w.texture] ?? WALL[0]!} />
          ))}
          <rect width={ROOM_W} height={ROOM_H} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={2} />
        </svg>,
      );
    }
  }
  const flags = [
    ...map.teams.flatMap((team, t) => team.flags.map((f) => ({ f, color: TEAM[t]! }))),
    ...map.wildFlags.map((f) => ({ f, color: TEAM[2]! })),
  ];
  return (
    <svg className={thumb ? 'map-thumb' : 'map-preview'} viewBox={`0 0 ${map.width * ROOM_W} ${map.height * ROOM_H}`} role="img" aria-label={label}>
      {rooms}
      {flags.map(({ f, color }, i) => (
        <circle key={i} cx={f.room.x * ROOM_W + f.x} cy={f.room.y * ROOM_H + f.y} r={Math.max(15, 12 * Math.max(map.width, map.height))} fill={color} stroke="#fff" strokeWidth={4} />
      ))}
    </svg>
  );
}
