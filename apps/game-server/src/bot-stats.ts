// SPDX-License-Identifier: GPL-2.0-or-later
// Partidas só de bots, como o `-bottest` do original (OG-053): capturas por partida e custo dos bots
// por frame. Com `--red-level`/`--blue-level` (OG-266), cada time joga num nível de dificuldade e o
// resultado traz vitórias e K/D de cada lado. Uso: node apps/game-server/dist/bot-stats.js
//   [--matches 50] [--bots 6] [--minutes 3] [--map outgun1] [--seed 1] [--red-level 1 --blue-level 5]
//   [--set "linha do gamemod"]...
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { botSkill, REFERENCE_BOT_LEVEL } from '@outgun/bots';
import { loadMaps } from './maps.js';
import { Room } from './room.js';

export interface BotStats {
  matches: number;
  /** Placar de cada partida (vermelho, azul). */
  scores: [number, number][];
  capturesPerMatch: number;
  /** Custo médio por frame (ms): sala inteira, bots (receber + decidir) e só as decisões. */
  tickMs: number;
  botsMs: number;
  decisionsMs: number;
  /** Vitórias de cada time e K/D de cada time no total das partidas. */
  wins: [number, number];
  kd: [number, number];
}

export function runBotMatches(opts: { matches: number; bots: number; minutes: number; map: string; seed: number; gamemod?: string[]; levels?: [number, number] }): BotStats {
  const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), [opts.map]);
  const gamemod = [`time_limit ${opts.minutes}`, ...(opts.gamemod ?? [])].join('\n');
  const room = new Room({ id: 'bot-stats', preset: 'classic', maps, mapFiles: [opts.map], maxPlayers: 16, seed: opts.seed, botTest: true, gamemod });
  for (let i = 0; i < opts.bots; i++) room.addBot();
  const setLevels = () => {
    if (!opts.levels) return;
    for (const b of room.botClients()) b.skill = botSkill(opts.levels[room.world.teamOf(b.playerId)] ?? REFERENCE_BOT_LEVEL);
  };
  setLevels();
  let ticks = 0;
  let tickMs = 0;
  // limite de segurança: partidas mais o placar entre elas
  const maxTicks = opts.matches * (opts.minutes * 600 + 200) + 100;
  while (room.results.length < opts.matches && ticks < maxTicks) {
    const t0 = performance.now();
    room.tick();
    tickMs += performance.now() - t0;
    if (ticks % 50 === 0) setLevels(); // o balanceamento pode trocar bots de time
    ticks++;
  }
  const bots = room.botClients();
  const scores = room.results.map((r) => [r.teams[0].score, r.teams[1].score] as [number, number]);
  const captures = scores.reduce((s, [a, b]) => s + a + b, 0);
  return {
    matches: scores.length,
    scores,
    capturesPerMatch: scores.length ? captures / scores.length : 0,
    tickMs: tickMs / ticks,
    botsMs: bots.reduce((s, b) => s + b.stepMs, 0) / ticks,
    decisionsMs: bots.reduce((s, b) => s + b.decisionMs, 0) / ticks,
    wins: [0, 1].map((t) => room.results.filter((r) => r.winner === t).length) as [number, number],
    kd: [0, 1].map((t) => {
      const kills = room.results.reduce((s, r) => s + r.teams[t as 0 | 1].kills, 0);
      const deaths = room.results.reduce((s, r) => s + r.teams[t as 0 | 1].deaths, 0);
      return Math.round((kills / Math.max(1, deaths)) * 100) / 100;
    }) as [number, number],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      matches: { type: 'string', default: '50' },
      bots: { type: 'string', default: '6' },
      minutes: { type: 'string', default: '3' },
      map: { type: 'string', default: 'outgun1' },
      seed: { type: 'string', default: '1' },
      set: { type: 'string', multiple: true, default: [] },
      'red-level': { type: 'string' },
      'blue-level': { type: 'string' },
    },
  });
  const stats = runBotMatches({
    matches: Number(values.matches),
    bots: Number(values.bots),
    minutes: Number(values.minutes),
    map: values.map,
    seed: Number(values.seed),
    gamemod: values.set,
    ...(values['red-level'] || values['blue-level'] ? { levels: [Number(values['red-level'] ?? REFERENCE_BOT_LEVEL), Number(values['blue-level'] ?? REFERENCE_BOT_LEVEL)] as [number, number] } : {}),
  });
  console.log(JSON.stringify(stats, null, 1));
}
