// SPDX-License-Identifier: GPL-2.0-or-later
import { translate } from '@outgun/i18n';
import type { ClientSession } from '@outgun/netcode';
import { presetSettings } from '@outgun/settings';
import { describe, expect, it } from 'vitest';
import { currentStats, mapScreen, playerScreen, serverScreen, sortMaps, teamScreen } from './info-screens.js';

const t = (text: string, ...args: string[]) => translate('en', text, ...args);
const zero = { carriedFlag: 'none', dead: false, frags: 0, kills: 0, deaths: 0, consKills: 0, curConsKills: 0, consDeaths: 0, curConsDeaths: 0, suicides: 0, captures: 0, assists: 0, flagsTaken: 0, flagsDropped: 0, flagsReturned: 0, carriersKilled: 0, playtime: 0, lifetime: 0, flagCarryingTime: 0 };

function fakeSession(now = 100): ClientSession {
  const s = {
    maxPlayers: 16,
    present: new Set([0, 1, 8]),
    names: new Map([[0, 'Ana'], [1, 'Bia'], [8, 'Cid']]),
    pastNames: new Map([[9, 'Dan']]),
    frags: new Map([[0, 2], [1, 5], [8, 1]]),
    pings: new Map([[0, 40]]),
    teamScores: [2, 1],
    gameOver: null,
    gameTime: () => now,
    playerStats: new Map([
      [0, { stats: { ...zero, pid: 0, kills: 4, curConsKills: 1, consKills: 3, deaths: 2, playtime: 50, lifetime: 30, carriedFlag: 'enemy', flagCarryingTime: 10 }, at: 90 }],
      [1, { stats: { ...zero, pid: 1, dead: true, playtime: 20, lifetime: 20 }, at: 90 }],
      [8, { stats: { ...zero, pid: 8 }, at: 90 }],
    ]),
    movementShots: new Map(),
    teamMovementShots: null,
    playerInfo: new Map([[0, { loggedIn: true, ranked: true, admin: false, rank: 7, score: 1729, negScore: 0, rankedPlayers: 42 }]]),
    teamStats: [
      { team: 'red', kills: 4, deaths: 2, suicides: 0, flagsTaken: 3, flagsDropped: 1, flagsReturned: 0, captures: [{ time: 70, pid: 0, assistant: 1 }, { time: 200, pid: 9, assistant: 255 }] },
      { team: 'blue', kills: 2, deaths: 4, suicides: 1, flagsTaken: 1, flagsDropped: 0, flagsReturned: 1, captures: [{ time: 125, pid: 8, assistant: 255 }] },
    ],
    mapList: [
      { file: 'a', title: 'Zeta', author: 'b', width: 6, height: 6, votes: 0 },
      { file: 'b', title: 'alfa', author: 'A', width: 3, height: 4, votes: 0 },
      { file: 'c', title: 'Beta', author: 'c', width: 4, height: 3, votes: 0 },
    ],
    mapVoteCounts: [0, 2, 1],
    currentMapIndex: 2,
  };
  return s as unknown as ClientSession;
}

describe('telas F2–F5 (OG-066)', () => {
  it('tempos avançam a partir do retrato: jogo sempre, vida se vivo, bandeira se carregando', () => {
    const s = fakeSession(100);
    expect(currentStats(s, 0)).toMatchObject({ playtime: 60, lifetime: 40, flagCarryingTime: 20 });
    expect(currentStats(s, 1)).toMatchObject({ playtime: 30, lifetime: 20 });
  });

  it('F3: contadores por time e capturas em ordem de tempo com o placar', () => {
    const screen = teamScreen(fakeSession(), t);
    expect(screen.tables[0]!.rows[0]!.cells).toEqual(['Captures', '2', '1']);
    expect(screen.tables[0]!.rows[1]!.cells).toEqual(['Kills', '4', '2']);
    expect(screen.tables[1]!.rows.map((r) => [...r.cells, r.tone])).toEqual([
      ['1:10', '1 - 0', 'Ana + Bia', 'red'],
      ['2:05', '1 - 1', 'Cid', 'blue'],
      ['3:20', '2 - 1', 'Dan', 'red'],
    ]);
  });

  it('F4: vermelhos por frags; página 1 com mortes total/seguidas/máximo; página 4 com o ranking', () => {
    const p1 = playerScreen(fakeSession(), 0, t);
    expect(p1.tables[0]!.caption).toBe('Red Team (2)');
    expect(p1.tables[0]!.rows.map((r) => r.cells[1])).toEqual(['Bia', 'Ana']);
    expect(p1.tables[0]!.rows[1]!.cells).toEqual(['MR  ', 'Ana', '40', '0', '0', '4/1/3', '2/0/0', '0']);
    const p4 = playerScreen(fakeSession(), 3, t);
    expect(p4.tables[0]!.rows[1]!.cells.slice(2)).toEqual(['1 min', '0:13', '7', '1729']);
    expect(p4.footer.map((r) => r.cells[0])).toEqual(['42 players in the ranking.', '4/4']);
  });

  it('F2: ordenações estáveis do original e o voto marcado', () => {
    const s = fakeSession();
    expect(sortMaps(s.mapList, s.mapVoteCounts, 'title')).toEqual([1, 2, 0]);
    expect(sortMaps(s.mapList, s.mapVoteCounts, 'votes')).toEqual([1, 2, 0]);
    // área igual (12): desempata pela largura
    expect(sortMaps(s.mapList, s.mapVoteCounts, 'size')).toEqual([1, 2, 0]);
    const screen = mapScreen(s, 'number', 1, '12', t);
    expect(screen.tables[0]!.rows[1]!.cells).toEqual(['2', '2', '*', 'alfa', '3x4', 'A']);
    expect(screen.tables[0]!.rows[2]!.tone).toBe('selected');
    expect(screen.footer[1]!.cells[0]).toBe('Vote map number: 12_');
  });

  it('F5: regras do Ranked (sem power-ups) e do Clássico', () => {
    const rows = (preset: string) => Object.fromEntries(serverScreen(presetSettings(preset), preset, 'x', t).tables[0]!.rows.map((r) => r.cells));
    expect(rows('ranked')).toMatchObject({ Powerups: '0', 'Capture limit': '8' });
    expect(rows('ranked')['Powerup time']).toBeUndefined();
    expect(rows('classic')).toMatchObject({ 'Minimum powerups': '20% of rooms', 'Maximum powerups': '80% of rooms' });
  });
});
