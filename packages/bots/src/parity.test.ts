// SPDX-License-Identifier: GPL-2.0-or-later
// Paridade da IA dos bots com o original, decisão por decisão (modo resync): para cada decisão
// gravada pelo oráculo, carrega a visão e o estado do bot, roda `Robot.decide` com os mesmos rand()
// e compara controles, tiro e o estado do bot depois.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseMapFile } from '@outgun/content';
import { describe, expect, it } from 'vitest';
import { AreaMap } from './areamap.js';
import { botStateOf, pendingControls, RecordedRng, robotFromDump, type BotDump } from './oracle-dump.js';

const repoRoot = join(import.meta.dirname, '../../..');

function loadDumps(name: string): BotDump[] {
  const text = gunzipSync(readFileSync(join(repoRoot, 'tools/parity/traces', `${name}.bots.jsonl.gz`))).toString('utf8');
  return text
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as BotDump);
}

function loadMap(file: string): AreaMap {
  const r = parseMapFile(file, readFileSync(join(repoRoot, file)));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return new AreaMap(r.map);
}

interface Mismatch {
  index: number;
  frame: number;
  me: number;
  what: string;
}

function runResync(dumps: BotDump[], areaMap: AreaMap): Mismatch[] {
  const out: Mismatch[] = [];
  dumps.forEach((d, index) => {
    const rng = new RecordedRng(d.rand);
    const bot = robotFromDump(areaMap.map, areaMap, d.before, rng);
    const { controls, pending } = pendingControls(d.before);
    const at = { index, frame: d.before.frame, me: d.before.me };
    let decision;
    try {
      decision = bot.decide(!!d.before.hidden, controls, pending);
    } catch (e) {
      out.push({ ...at, what: `exceção: ${(e as Error).message}` });
      return;
    }
    if (rng.index !== d.rand.length) out.push({ ...at, what: `rand: usou ${rng.index} de ${d.rand.length}` });
    if (decision.controls !== d.after.controls) out.push({ ...at, what: `controles ${decision.controls} ≠ ${d.after.controls}` });
    const got = botStateOf(bot);
    const exp = d.after.state.bot;
    for (const k of Object.keys(exp) as (keyof typeof exp)[]) {
      // giro livre: atan2/cos/sin do V8 e da glibc (com -ffast-math) diferem na 15ª casa
      if (k === 'gunDir' && Math.abs(got.gunDir - exp.gunDir) < 1e-9) continue;
      if (JSON.stringify(got[k]) !== JSON.stringify(exp[k])) out.push({ ...at, what: `${k}: ${JSON.stringify(got[k])} ≠ ${JSON.stringify(exp[k])}` });
    }
    const seen = Array.from(bot.fx.enemiesSeenFrame);
    if (JSON.stringify(seen) !== JSON.stringify(d.after.state.seen)) out.push({ ...at, what: 'enemies_seen_frame' });
    d.after.state.players.forEach((p, i) => {
      if (!p.used) return;
      const bp = bot.player(i);
      const gp = [bp.pos.roomX, bp.pos.roomY, bp.pos.x, bp.pos.y, bp.posUpdated, bp.defending ? 1 : 0];
      const ep = [...p.pos!, p.posUpdated, p.defending];
      if (JSON.stringify(gp) !== JSON.stringify(ep)) out.push({ ...at, what: `jogador ${i}: ${JSON.stringify(gp)} ≠ ${JSON.stringify(ep)}` });
    });
  });
  return out;
}

const scenarios: [string, string, string][] = [
  ['bots-ai-outgun1', 'maps/outgun1.txt', '6 bots'],
  ['bots-ai-verde', 'maps/verde.txt', 'selvagem, captura fora da base, levar a própria'],
  ['bots-ai-freeturn', 'cmaps/3x2.txt', 'giro livre, fogo amigo, colisões'],
  ['bots-ai-ksii', 'cmaps/ksii.txt', 'áreas de respawn, 10 bots'],
  ['bots-ai-deathbringer', 'maps/outgun1.txt', 'só deathbringer, deathbringer amigo'],
];

describe('IA dos bots × original (resync por decisão)', () => {
  it.each(scenarios)('%s (%s: %s)', (name, map) => {
    const dumps = loadDumps(name);
    expect(dumps.length).toBeGreaterThan(3000);
    const mismatches = runResync(dumps, loadMap(map));
    const summary = mismatches.slice(0, 15).map((m) => `#${m.index} f${m.frame} bot ${m.me}: ${m.what}`);
    expect(summary, `${mismatches.length} divergências`).toEqual([]);
  });
});
