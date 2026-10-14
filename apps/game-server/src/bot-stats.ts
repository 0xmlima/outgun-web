// SPDX-License-Identifier: GPL-2.0-or-later
// Partidas só de bots, como o `-bottest` do original (OG-053): capturas por partida e custo dos bots
// por frame. Uso: node apps/game-server/dist/bot-stats.js [--matches 50] [--bots 6] [--minutes 3]
//   [--map outgun1] [--seed 1] [--set "linha do gamemod"]...
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
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
}

export function runBotMatches(opts: { matches: number; bots: number; minutes: number; map: string; seed: number; gamemod?: string[] }): BotStats {
  const maps = loadMaps(fileURLToPath(new URL('../../../maps', import.meta.url)), [opts.map]);
  const gamemod = [`time_limit ${opts.minutes}`, ...(opts.gamemod ?? [])].join('\n');
  const room = new Room({ id: 'bot-stats', preset: 'classic', maps, mapFiles: [opts.map], maxPlayers: 16, seed: opts.seed, botTest: true, gamemod });
  for (let i = 0; i < opts.bots; i++) room.addBot();
  let ticks = 0;
  let tickMs = 0;
  // limite de segurança: partidas mais o placar entre elas
  const maxTicks = opts.matches * (opts.minutes * 600 + 200) + 100;
  while (room.results.length < opts.matches && ticks < maxTicks) {
    const t0 = performance.now();
    room.tick();
    tickMs += performance.now() - t0;
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
    },
  });
  const stats = runBotMatches({
    matches: Number(values.matches),
    bots: Number(values.bots),
    minutes: Number(values.minutes),
    map: values.map,
    seed: Number(values.seed),
    gamemod: values.set,
  });
  console.log(JSON.stringify(stats, null, 1));
}
