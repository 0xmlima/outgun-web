// SPDX-License-Identifier: GPL-2.0-or-later
// Radar da partida no relatório (OG-475): cada conta da ranqueada com os eixos daquela partida (em
// percentil contra a temporada) por cima do radar da temporada, tracejado. Casual e bots não têm.
import { usePrefs } from '../app/prefs.js';
import { Panel } from '../ui/Panel.js';
import { StyleRadar, type RadarSeries } from '../ui/StyleRadar.js';
import { AXIS_LABELS, STYLE_AXES, type StyleAxisValue, type StyleRadarData } from '../ui/style-radar.js';
import type { PdfTable } from './report-pdf.js';
import { PlayerLink, useApi } from './stats.js';

export interface MatchStyle {
  ranked: boolean;
  minimumSeconds: number;
  players: { username: string; short: boolean; match: StyleAxisValue[] | null; season: StyleRadarData }[];
}

type T = (text: string, ...args: string[]) => string;

/** Séries de um jogador: a partida por cima e a temporada tracejada. */
export function matchSeries(p: MatchStyle['players'][number], t: T, color: string): RadarSeries[] {
  return [
    ...(p.match ? [{ key: 'match', label: t('This match'), axes: p.match, color }] : []),
    ...(p.season.axes ? [{ key: 'season', label: t('Season'), axes: p.season.axes, dashed: true, color: 'var(--text-muted)' }] : []),
  ];
}

/** Tabela do PDF (OG-475): percentil da partida e, entre parênteses, o da temporada. */
export function matchStyleTable(style: MatchStyle, t: T, teamOf: (username: string) => number | null): PdfTable | undefined {
  if (!style.ranked || style.players.length === 0) return undefined;
  const cell = (p: MatchStyle['players'][number], axis: (typeof STYLE_AXES)[number]) => {
    const m = p.match?.find((a) => a.axis === axis)?.percentile;
    const s = p.season.axes?.find((a) => a.axis === axis)?.percentile;
    return p.short ? '—' : `${m ?? '—'}${s !== undefined ? ` (${s})` : ''}`;
  };
  return {
    title: t('Play style in this match'),
    head: [t('Player'), ...STYLE_AXES.map((a) => t(AXIS_LABELS[a]))],
    body: style.players.map((p) => [p.short ? `${p.username} · ${t('match too short')}` : p.username, ...STYLE_AXES.map((a) => cell(p, a))]),
    rowTeams: style.players.map((p) => teamOf(p.username)),
    nameColumn: 0,
    note: t('Percentile of the match against everyone active in the season; the season percentile in parentheses.'),
    small: true,
  };
}

export function MatchStylePanel({ matchId, teamOf, colorOf }: { matchId: string; teamOf: (username: string) => number | null; colorOf: (team: number | null) => string }) {
  const { t } = usePrefs();
  const res = useApi<MatchStyle>(`/matches/${encodeURIComponent(matchId)}/style`, true);
  const d = res.data;
  if (!d?.ranked || d.players.length === 0) return null;
  const players = [...d.players].sort((a, b) => (teamOf(a.username) ?? 2) - (teamOf(b.username) ?? 2));
  return (
    <Panel title={t('Play style in this match')}>
      <ul className="match-style-grid">
        {players.map((p) => (
          <li key={p.username}>
            <PlayerLink name={p.username} username={p.username} />
            {p.short ? (
              <p className="ui-muted">{t('Match too short for a radar (under $1 min played).', String(Math.round(d.minimumSeconds / 60)))}</p>
            ) : (
              <StyleRadar caption={t('Play style of $1', p.username)} series={matchSeries(p, t, colorOf(teamOf(p.username)))} />
            )}
          </li>
        ))}
      </ul>
      <p className="ui-muted">{t('Solid: this match against everyone active in the season. Dashed: the player in the season.')}</p>
    </Panel>
  );
}
