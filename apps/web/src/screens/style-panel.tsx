// SPDX-License-Identifier: GPL-2.0-or-later
// Painel "Estilo de jogo" do perfil (OG-471, RN-RAD): radar da temporada (ou de sempre) com a
// anterior em tracejado, o arquétipo, a amostra e a mudança por eixo. Período na URL (`style`).
import { useSearchParams } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Badge } from '../ui/Button.js';
import { ChoiceField } from '../ui/Field.js';
import { Panel } from '../ui/Panel.js';
import { StyleRadar, type RadarSeries } from '../ui/StyleRadar.js';
import { ARCHETYPE_LABELS, AXIS_LABELS, STYLE_AXES, type StyleRadarData } from '../ui/style-radar.js';
import { Table } from '../ui/Table.js';
import { statScope } from './leaderboard.js';
import { Status, useApi, type FormatFilter } from './stats.js';

interface SeasonRef {
  id: number;
  name: string;
  active: boolean;
}

export interface StyleResponse {
  username: string;
  season: SeasonRef | null;
  radar: StyleRadarData;
  previous: { season: SeasonRef; radar: StyleRadarData } | null;
  since: { defense: string | null; team: string | null };
}

/** Mínimo de ranqueadas para ter radar (RN-RAD-03). */
export const STYLE_MINIMUM_GAMES = 3;

/** Período do radar na URL: `current` (padrão), o id de uma temporada ou `all`. */
export function useStylePeriod(): [string, (p: string) => void] {
  const [params, setParams] = useSearchParams();
  const period = params.get('style') ?? 'current';
  const set = (p: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (p === 'current') next.delete('style');
        else next.set('style', p);
        return next;
      },
      { replace: true },
    );
  return [period, set];
}

/** Série de um radar (tracejada com poucos jogos); null sem radar. */
export function radarSeries(key: string, label: string, r: StyleRadarData | null | undefined, extra: Partial<RadarSeries> = {}): RadarSeries | null {
  return r?.axes ? { key, label, axes: r.axes, dashed: r.lowSample, ...extra } : null;
}

/** Selo do arquétipo e amostra ("poucos jogos" de 3 a 9). */
export function ArchetypeLine({ radar }: { radar: StyleRadarData }) {
  const { t } = usePrefs();
  return (
    <div className="ui-row">
      {radar.archetype && <Badge tone="accent">{t(ARCHETYPE_LABELS[radar.archetype])}</Badge>}
      <span className="ui-muted">{t('$1 Ranked matches', String(radar.games))}</span>
      {radar.axes && radar.lowSample && <Badge tone="warning">{t('Few matches')}</Badge>}
    </div>
  );
}

export function RadarHelp() {
  const { t } = usePrefs();
  return (
    <details className="style-help">
      <summary>{t('How to read the radar')}</summary>
      <p className="ui-muted">
        {t('Each axis is a percentile against everyone active in the period: 50 is the median, 90 means better than 90% of them. The area is not a grade: it shows a style. Percentiles change as other people play.')}
      </p>
    </details>
  );
}

export function StylePanel({ name, format, seasons }: { name: string; format: FormatFilter; seasons: readonly SeasonRef[] }) {
  const { t, prefs } = usePrefs();
  const [period, setPeriod] = useStylePeriod();
  const res = useApi<StyleResponse>(`/players/${encodeURIComponent(name)}/style?${statScope(period, format).toString()}`, true, 'matches');
  const d = res.data;
  const past = seasons.filter((s) => !s.active);
  const now = radarSeries('now', d?.season?.name ?? t('All time'), d?.radar);
  const before = d?.previous ? radarSeries('before', d.previous.season.name, d.previous.radar, { dashed: true, color: 'var(--text-muted)' }) : null;
  const series = [now, before].filter((s): s is RadarSeries => s !== null);
  const since = [d?.since.defense && ['defense', d.since.defense], d?.since.team && ['team', d.since.team]].filter((x): x is [string, string] => !!x);

  return (
    <Panel title={t('Play style')}>
      <div className="ui-row">
        <ChoiceField
          label={t('Period')}
          value={period}
          onChange={setPeriod}
          options={[{ value: 'current', label: t('Current season') }, ...past.map((x) => ({ value: String(x.id), label: x.name })), { value: 'all', label: t('All time') }]}
        />
      </div>
      {!d ? (
        <Status loading={d === undefined} missing={d === null} error={res.error} />
      ) : (
        <div className="ui-stack">
          <ArchetypeLine radar={d.radar} />
          {d.radar.axes ? (
            <StyleRadar caption={t('Play style of $1', d.username)} series={series} />
          ) : (
            <p className="ui-muted">{t('Play $1 more Ranked matches in the period to see the radar.', String(Math.max(1, STYLE_MINIMUM_GAMES - d.radar.games)))}</p>
          )}
          {now && before && (
            <Table
              caption={t('Change since $1', d.previous!.season.name)}
              rows={STYLE_AXES}
              rowKey={(a) => a}
              columns={[
                { key: 'axis', header: t('Axis'), cell: (a) => t(AXIS_LABELS[a]) },
                { key: 'now', header: now.label, align: 'end', cell: (a) => now.axes.find((x) => x.axis === a)?.percentile ?? '—' },
                { key: 'before', header: before.label, align: 'end', cell: (a) => before.axes.find((x) => x.axis === a)?.percentile ?? '—' },
                {
                  key: 'delta',
                  header: '+/−',
                  align: 'end',
                  cell: (a) => {
                    const n = now.axes.find((x) => x.axis === a)?.percentile;
                    const b = before.axes.find((x) => x.axis === a)?.percentile;
                    if (n === undefined || b === undefined) return '—';
                    const delta = n - b;
                    return <span className={delta > 0 ? 'style-up' : delta < 0 ? 'style-down' : 'ui-muted'}>{delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '0'}</span>;
                  },
                },
              ]}
            />
          )}
          {d.radar.axes && !before && d.season && <p className="ui-muted">{t('No previous season to compare yet.')}</p>}
          {since.length > 0 && (
            <p className="ui-muted">
              {since.map(([axis, at]) => t('$1 counts since $2', t(AXIS_LABELS[axis as 'defense' | 'team']), new Date(at).toLocaleDateString(prefs.locale, { day: '2-digit', month: '2-digit' }))).join(' · ')}
            </p>
          )}
          <RadarHelp />
        </div>
      )}
    </Panel>
  );
}
