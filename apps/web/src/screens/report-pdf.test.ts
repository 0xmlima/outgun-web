// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import type { MatchEvents } from './MatchReport.js';
import { gameSummary, matchReportDoc, pdfFilename, pdfText, renderReportPdf, seriesCoverDoc } from './report-pdf.js';
import type { MatchPage, PlayerLine, SeriesView } from './stats.js';

const t = (text: string, ...args: string[]) => args.reduce((s, a, i) => s.replace(`$${i + 1}`, a), text);

const player = (slot: number, team: number, frags: number, extra: Partial<PlayerLine> = {}): PlayerLine => ({
  slot, name: `p${slot}`, username: `p${slot}`, team, isBot: false, frags, kills: frags, deaths: 2, captures: team === 0 ? 1 : 0, playSeconds: 600, scoreDelta: 0, negDelta: 0,
  stats: { assists: 1, effectiveDamage: 140.4, defenses: 2, multiKills: frags > 3 ? 1 : 0, accuracy: 0.31 }, ...extra,
});

const series: SeriesView = {
  id: 's1', format: '3x3', bestOf: 3, games: 2, redWins: 2, blueWins: 0, winner: 0, finished: true, startedAt: '2026-10-20T20:00:00Z',
  matches: [
    { id: 'm1', gameNo: 1, mapTitle: 'Arena', redScore: 3, blueScore: 1, endedAt: '2026-10-20T20:10:00Z' },
    { id: 'm2', gameNo: 2, mapTitle: 'Castelo', redScore: 2, blueScore: 0, endedAt: '2026-10-20T20:22:00Z' },
  ],
};

const page = (mode: 'casual' | 'ranked'): MatchPage => ({
  match: { id: 'm1', endedAt: '2026-10-20T20:10:00Z', startedAt: '2026-10-20T20:00:00Z', roomId: 'r1', mode, ranked: mode === 'ranked', format: mode === 'ranked' ? '3x3' : null, map: 'arena', mapTitle: 'Arena', redScore: 3, blueScore: 1, clanWar: mode === 'ranked' },
  teams: mode === 'ranked' ? [{ tag: 'DK', name: 'Dark', color: '#AA2200' }, null] : null,
  details: { mapTitle: 'Arena', rules: { captureLimit: 3, winScoreDifference: 1, timeLimit: 6000, extraTime: 0, extraTimePeriods: 0, suddenDeath: false }, captures: [{ time: 60, team: 0, capturer: 'p0', assistant: 'p2' }], teams: [{ score: 3, kills: 9 }, { score: 1, kills: 4 }] },
  players: [player(0, 0, 5), player(1, 1, 3), player(2, 0, 4), player(3, 1, 1)],
  replayUrl: null,
  milestones: [{ username: 'p0', milestone: 'first-win' }],
  ...(mode === 'ranked' ? { format: '3x3', gameNo: 1, series, clans: { red: { tag: 'DK', name: 'Dark' }, blue: { tag: 'DT', name: 'Dt' } }, skill: [{ username: 'p0', team: 0, before: 1000, after: 1029, winChance: 0.55 }, { username: 'p1', team: 1, before: 1010, after: 990, winChance: 0.45 }] } : {}),
});

const events: MatchEvents = {
  players: [0, 1, 2, 3].map((slot) => ({ slot, name: `p${slot}`, username: `p${slot}`, team: slot % 2, isBot: false })),
  events: [[10, 'kill', 0, 1], [20, 'kill', 0, 3], [30, 'kill', 1, 0]],
};

describe('PDF do relatório (OG-425, RN-SOC-08)', () => {
  it('Casual: placar, ficha e todas as seções da tela', () => {
    const doc = matchReportDoc(page('casual'), events, t, 'pt-BR', 'https://outgun.test');
    expect(doc.score).toMatchObject({ red: 'Red', blue: 'Blue', redScore: 3, blueScore: 1, result: 'Red team wins' });
    expect(doc.facts.map(([k]) => k)).toEqual(expect.arrayContaining(['Map', 'Mode', 'Date', 'Duration', 'Capture limit', 'Time limit', 'Best player', 'Game version']));
    expect(doc.tables.map((x) => x.title)).toEqual(['Highlights', 'Red team · 3', 'Blue team · 1', 'Captures', 'Team stats', 'Kills by victim', 'Player stats · Red team', 'Player stats · Blue team', 'Milestones']);
    const red = doc.tables[1]!;
    expect(red.body.map((r) => r[0])).toEqual(['p0 *', 'p2']);
    expect(red.head).not.toContain('Rating');
    expect(doc.tables[5]!.body[0]).toEqual(['p0', '-', '', '1', '1']); // ordem por time: p0, p2, p1, p3
    expect(doc.link).toBe('https://outgun.test/matches/m1');
  });

  it('Ranked: lado do clã, rating, chance prevista e a série', () => {
    const doc = matchReportDoc(page('ranked'), null, t, 'pt-BR', 'https://outgun.test');
    expect(doc.score).toMatchObject({ red: 'Dark', redColor: '#AA2200', result: 'Dark wins' }); // nome do clã, não a tag
    expect(doc.score.notes).toEqual(expect.arrayContaining(['Clan vs clan · Dark x Dt', 'Predicted win chance: red 55% · blue 45%']));
    expect(doc.tables[1]!.head).toContain('Rating');
    expect(doc.tables[1]!.body[0]!.at(-1)).toBe('+29 (1029)');
    expect(doc.tables.map((x) => x.title)).not.toContain('Kills by victim');
    expect(doc.tables.at(-1)!.title).toBe('Series · 3x3 · Best of 3');
  });

  it('gera um PDF A4 com o texto da partida', () => {
    const pdf = renderReportPdf([matchReportDoc(page('ranked'), events, t, 'pt-BR', 'https://outgun.test')], t, false);
    const out = pdf.output();
    expect(out.startsWith('%PDF-')).toBe(true);
    for (const text of ['Arena', 'Dark', 'Kills by victim', 'Page 1 of', 'https://outgun.test/matches/m1']) expect(out).toContain(text);
    expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
  });

  it('série (OG-426): capa e cada partida em sequência', () => {
    const cover = seriesCoverDoc(series, t, 'pt-BR', 'https://outgun.test');
    expect(cover.score).toMatchObject({ redScore: 2, blueScore: 0, result: 'Red team wins the series 2 × 0' });
    expect(cover.tables[0]!.body).toEqual([['Game 1', 'Arena', '3-1'], ['Game 2', 'Castelo', '2-0']]);
    const pdf = renderReportPdf([cover, matchReportDoc(page('ranked'), null, t, 'pt-BR', 'https://outgun.test')], t, false);
    const out = pdf.output();
    expect(out).toContain('https://outgun.test/series/s1');
    expect(out).toContain('https://outgun.test/matches/m1');
  });

  it('texto e nome do arquivo', () => {
    expect(pdfText('3 – 1 “x” …')).toBe('3 - 1 "x" ...');
    expect(pdfText('ação · º')).toBe('ação · º');
    expect(pdfFilename('match', 'm1', '2026-10-20T20:10:00Z')).toBe('outgun-partida-m1-2026-10-20.pdf');
    expect(pdfFilename('series', 's1', '2026-10-20T20:00:00Z')).toBe('outgun-serie-s1-2026-10-20.pdf');
  });

  it('resumo do jogo (OG-502): cores dos lados, linhas sem dado somem, tempo com a bandeira em porcentagem', () => {
    const m = page('ranked');
    const withStats: MatchPage = {
      ...m,
      details: { ...m.details, teams: [{ score: 3, kills: 9, deaths: 4, shots: 120 }, { score: 1, kills: 4, deaths: 9, shots: 80 }] },
      players: [player(0, 0, 5, { stats: { flagCarryingTime: 30 } }), player(1, 1, 3, { stats: { flagCarryingTime: 10 } })],
    };
    const sum = gameSummary(withStats, t, (team) => (team === 0 ? 'Dark' : 'Blue'))!;
    expect(sum.sides).toEqual([
      { name: 'Dark', color: '#AA2200' },
      { name: 'Blue', color: '#1565C0' },
    ]);
    expect(sum.share).toEqual({ label: 'Time with the flag', red: 75, blue: 25 });
    expect(sum.rows.map((r) => r.label)).toEqual(['Captures', 'Kills', 'Deaths', 'Shots']);
    expect(sum.rows.find((r) => r.label === 'Deaths')).toMatchObject({ red: 4, blue: 9, lowerIsBetter: true });
    expect(matchReportDoc(withStats, null, t, 'pt-BR', 'https://outgun.test').summary).toBeDefined();
  });
});
