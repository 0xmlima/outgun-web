// SPDX-License-Identifier: GPL-2.0-or-later
// Prévia do confronto (OG-474) e radar dos times no lobby (OG-477): a mediana de cada lado na
// temporada ativa (pelo clã, quando o lado é um clã: RN-RAD-05) e a vantagem por eixo.
import { usePrefs } from '../app/prefs.js';
import { StyleRadar, type RadarSeries } from '../ui/StyleRadar.js';
import { ARCHETYPE_LABELS, AXIS_LABELS, axisEdges, STYLE_AXES, type Archetype, type StyleAxis, type StyleRadarData } from '../ui/style-radar.js';
import { useApi } from './stats.js';

interface Median {
  axes: { axis: StyleAxis; percentile: number }[];
  archetype: Archetype;
  strongest: StyleAxis;
  weakest: StyleAxis;
  members: number;
}
export interface LineupSide {
  clan: string | null;
  median: Median | null;
  players: { username: string; radar: StyleRadarData }[];
}
export interface Lineup {
  sides: [LineupSide, LineupSide];
}

export interface MatchupSide {
  readonly label: string;
  readonly players: readonly string[];
  readonly clan?: string | null | undefined;
  readonly color?: string | null | undefined;
}

/** Caminho da API para a escalação; nomes em ordem estável para o cache não variar à toa. */
export function lineupPath(red: MatchupSide, blue: MatchupSide): string {
  const q = new URLSearchParams({ red: [...red.players].sort().join(','), blue: [...blue.players].sort().join(',') });
  if (red.clan) q.set('redClan', red.clan);
  if (blue.clan) q.set('blueClan', blue.clan);
  return `/style/lineup?${q.toString()}`;
}

/** Os dois radares sobrepostos e a vantagem de cada lado; `data` vem de `useLineup`. */
export function MatchupRadar({ red, blue, data, mini = false }: { red: MatchupSide; blue: MatchupSide; data: Lineup | null | undefined; mini?: boolean }) {
  const { t } = usePrefs();
  if (!data) return null;
  const [r, b] = data.sides;
  const series = (side: LineupSide, s: MatchupSide, key: string, fallback: string): RadarSeries | null =>
    side.median ? { key, label: s.label, axes: side.median.axes.map((a) => ({ ...a, value: 0 })), percentOnly: true, color: s.color ?? fallback } : null;
  const list = [series(r, red, 'red', 'var(--text-team-red)'), series(b, blue, 'blue', 'var(--text-team-blue)')].filter((s): s is RadarSeries => s !== null);
  const edges = r.median && b.median ? axisEdges(r.median.axes, b.median.axes) : null;
  return (
    <div className="ui-stack matchup-radar">
      <StyleRadar caption={t('$1 vs $2', red.label, blue.label)} series={list} mini={mini} empty={t('No radar yet on either side')} />
      {edges && !mini && (
        <ul className="matchup-edges">
          {STYLE_AXES.map((axis) => (
            <li key={axis} className={edges[axis]}>
              <span>{t(AXIS_LABELS[axis])}</span>
              <strong>{edges[axis] === 'even' ? t('Even') : edges[axis] === 'a' ? red.label : blue.label}</strong>
            </li>
          ))}
        </ul>
      )}
      {!mini && (
        <p className="ui-muted">
          {[r, b]
            .map((side, i) => {
              const s = i === 0 ? red : blue;
              return side.median ? `${s.label}: ${t(ARCHETYPE_LABELS[side.median.archetype])} (${t('median of $1 players', String(side.median.members))})` : `${s.label}: ${t('no radar yet')}`;
            })
            .join(' · ')}
        </p>
      )}
    </div>
  );
}

export function useLineup(red: MatchupSide, blue: MatchupSide) {
  return useApi<Lineup>(lineupPath(red, blue), true);
}
