// SPDX-License-Identifier: GPL-2.0-or-later
// Registro dos eventos da ranqueada (OG-362): abates e bandeiras em ordem, com o momento em décimos.
import { fileURLToPath } from 'node:url';
import { message } from '@outgun/protocol';
import { DamageType } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { MATCH_EVENTS_LIMIT, MatchEventRecorder } from './match-events.js';
import { loadMaps } from './maps.js';
import type { MatchReport } from './match-report.js';
import { Room, type Connection } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1', 'coliseu']);
class TestConnection implements Connection {
  send(): void {}
  close(): void {}
}
const account = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function setup(preset: string) {
  const matches: MatchReport[] = [];
  const r = new Room({ id: preset, preset, maps, mapFiles: ['outgun1', 'coliseu'], maxPlayers: 16, seed: 3, reportMatch: (m) => matches.push(m) });
  const pids = [1, 2, 3, 4].map((n) => {
    const res = r.join(new TestConnection(), { name: `J${n}`, accountId: account(n) });
    if (!res.ok) throw new Error(res.text);
    r.handle(res.pid, [message('clientReady', {})]);
    return res.pid;
  });
  r.settings.world.timeLimit = 60;
  r.settings.world.extraTime = 0;
  return { r, pids, matches };
}

describe('registro de eventos (OG-362)', () => {
  it('uma ranqueada curta gera os abates e as bandeiras na ordem, com os momentos', () => {
    const { r, pids, matches } = setup('ranked');
    for (let i = 0; i < 5; i++) r.tick();
    const red = pids.filter((p) => r.world.teamOf(p) === 0);
    const blue = pids.filter((p) => r.world.teamOf(p) === 1);
    const t1 = r.world.mapTime();
    r.sim.damagePlayer(blue[0]!, red[0]!, 10_000, DamageType.rocket);
    for (let i = 0; i < 3; i++) r.tick();
    const t2 = r.world.mapTime();
    r.sim.damagePlayer(red[1]!, blue[1]!, 10_000, DamageType.rocket);
    for (let i = 0; i < 80 && matches.length === 0; i++) r.tick();
    expect(matches).toHaveLength(1);
    const log = matches[0]!.events!;
    const kills = log.events.filter((e) => e[1] === 'kill');
    const name = (pid: number) => `J${pids.indexOf(pid) + 1}`;
    expect(kills.map((e) => [e[0], log.players[e[2]]!.name, log.players[e[3]]!.name, e[6], e[7]])).toEqual([
      [t1, name(red[0]!), name(blue[0]!), 0, 'rocket'],
      [t2, name(blue[1]!), name(red[1]!), 0, 'rocket'],
    ]);
    expect(t2).toBeGreaterThan(t1);
    expect(log.players.every((p) => p.userId && !p.bot)).toBe(true);
  });

  it('partida Casual também leva eventos (OG-381, D-75)', () => {
    const { r, matches } = setup('classic');
    for (let i = 0; i < 80 && matches.length === 0; i++) r.tick();
    expect(matches[0]?.events).toBeDefined();
  });

  it('bandeiras pela cor, slot reaproveitado vira outro jogador e o teto é respeitado', () => {
    let who = { slot: 3, name: 'A', team: 0 as const, bot: false };
    const rec = new MatchEventRecorder(() => who);
    rec.flag(10, 'take', 3, 1);
    rec.flag(12, 'drop', 3, 1);
    who = { ...who, name: 'B', team: 1 as never };
    rec.flag(15, 'return', 3, 1);
    expect(rec.log()).toEqual({
      players: [{ slot: 3, name: 'A', team: 0, bot: false }, { slot: 3, name: 'B', team: 1, bot: false }],
      events: [[10, 'take', 0, 1], [12, 'drop', 0, 1], [15, 'return', 1, 1]],
    });
    for (let i = 0; i < MATCH_EVENTS_LIMIT + 5; i++) rec.flag(i, 'take', 3, 2);
    expect(rec.log().events).toHaveLength(MATCH_EVENTS_LIMIT);
    rec.reset();
    expect(rec.log()).toEqual({ players: [], events: [] });
  });
});
