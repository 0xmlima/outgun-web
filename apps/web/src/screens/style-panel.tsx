// SPDX-License-Identifier: GPL-2.0-or-later
// Painel "Estilo de jogo" do perfil (OG-471, RN-RAD): radar da temporada (ou de sempre) com a
// anterior em tracejado, o arquétipo, a amostra e a mudança por eixo. Período na URL (`style`) e,
// na comparação jogador x jogador (OG-472), o outro nome (`vs`).
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { ChoiceField, TextField } from '../ui/Field.js';
import { Panel } from '../ui/Panel.js';
import { StyleRadar, type RadarSeries } from '../ui/StyleRadar.js';
import { ARCHETYPE_LABELS, AXIS_LABELS, axisLeads, STYLE_AXES, type StyleAxis, type StyleRadarData } from '../ui/style-radar.js';
import { shareCanvas, styleCard } from '../ui/style-card.js';
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
  clanTag: string | null;
  clan: { tag: string; name: string; color: string | null } | null;
  reference: { kind: string; members: number; axes: { axis: StyleAxis; percentile: number }[] } | null;
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

/** "Compartilhar estilo" (OG-478): o cartão PNG de um jogador ou da comparação. */
export function ShareStyleButton({ sides, format }: { sides: readonly StyleResponse[]; format: FormatFilter }) {
  const { t } = usePrefs();
  const withRadar = sides.filter((s) => s.radar.axes);
  if (withRadar.length === 0) return null;
  const share = () => {
    const first = sides[0]!;
    const period = [first.season?.name ?? t('All time'), format === 'all' ? null : format].filter(Boolean).join(' · ');
    const card = styleCard(
      sides.map((s) => ({ name: s.username, clan: s.clan, archetype: s.radar.archetype ? t(ARCHETYPE_LABELS[s.radar.archetype]) : null, axes: s.radar.axes ?? [] })),
      { axes: STYLE_AXES.map((a) => t(AXIS_LABELS[a])), period, site: location.host },
    );
    void shareCanvas(card, `estilo-${sides.map((s) => s.username.toLowerCase()).join('-x-')}.png`);
  };
  return (
    <Button variant="ghost" onClick={share}>
      {t('Share style')}
    </Button>
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

/** Nome do outro jogador da comparação na URL (`vs`); vazio = sem comparação. */
function useVsParam(): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const set = (v: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set('vs', v);
        else next.delete('vs');
        return next;
      },
      { replace: true },
    );
  return [params.get('vs') ?? '', set];
}

export function StylePanel({ name, format, seasons, me }: { name: string; format: FormatFilter; seasons: readonly SeasonRef[]; me?: string | undefined }) {
  const { t, prefs } = usePrefs();
  const [period, setPeriod] = useStylePeriod();
  const [vs, setVs] = useVsParam();
  const [typed, setTyped] = useState('');
  // sombra de referência (OG-476): nenhuma, mediana do clã do jogador ou do top 10 do período
  const [reference, setReference] = useState<'' | 'clan' | 'top10'>('');
  const scope = statScope(period, format).toString();
  const res = useApi<StyleResponse>(`/players/${encodeURIComponent(name)}/style?${scope}${reference && !vs ? `&reference=${reference}` : ''}`, true, 'matches');
  const d = res.data;
  const past = seasons.filter((s) => !s.active);
  const now = radarSeries('now', d?.season?.name ?? t('All time'), d?.radar);
  const before = d?.previous ? radarSeries('before', d.previous.season.name, d.previous.radar, { dashed: true, color: 'var(--text-muted)' }) : null;
  const series = [now, before].filter((s): s is RadarSeries => s !== null);
  const since = [d?.since.defense && ['defense', d.since.defense], d?.since.team && ['team', d.since.team]].filter((x): x is [string, string] => !!x);
  const compare = (who: string) => {
    setVs(who.trim());
    setTyped('');
  };

  return (
    <Panel title={t('Play style')}>
      <div className="ui-row">
        <ChoiceField
          label={t('Period')}
          value={period}
          onChange={setPeriod}
          options={[{ value: 'current', label: t('Current season') }, ...past.map((x) => ({ value: String(x.id), label: x.name })), { value: 'all', label: t('All time') }]}
        />
        <TextField label={t('Compare with')} value={typed} onChange={setTyped} maxLength={32} placeholder={t('Player name')} onEnter={() => typed.trim() && compare(typed)} />
        <Button disabled={!typed.trim()} onClick={() => compare(typed)}>
          {t('Compare')}
        </Button>
        {!vs && (
          <ChoiceField
            label={t('Reference')}
            value={reference === 'clan' && d && !d.clanTag ? '' : reference}
            onChange={setReference}
            options={[
              { value: '', label: t('None') },
              ...(d?.clanTag ? [{ value: 'clan' as const, label: t('Median of $1', d.clanTag) }] : []),
              { value: 'top10', label: t('Median of the top 10') },
            ]}
          />
        )}
        {me && me.toLowerCase() !== name.toLowerCase() && vs.toLowerCase() !== me.toLowerCase() && <Button onClick={() => compare(me)}>{t('Compare with me')}</Button>}
        {vs && (
          <Button variant="ghost" onClick={() => setVs('')}>
            {t('Stop comparing')}
          </Button>
        )}
      </div>
      {vs && d ? (
        <StyleCompare left={d} rightName={vs} scope={scope} format={format} />
      ) : !d ? (
        <Status loading={d === undefined} missing={d === null} error={res.error} />
      ) : (
        <div className="ui-stack">
          <div className="ui-row">
            <ArchetypeLine radar={d.radar} />
            <ShareStyleButton sides={[d]} format={format} />
          </div>
          {d.radar.axes ? (
            <StyleRadar
              caption={t('Play style of $1', d.username)}
              series={series}
              {...(d.reference && reference
                ? { shadow: { key: 'ref', label: d.reference.kind === 'clan' ? t('Median of $1', d.clanTag ?? '') : t('Median of the top 10'), axes: d.reference.axes.map((a) => ({ ...a, value: 0 })), percentOnly: true } }
                : {})}
            />
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

/**
 * Jogador x jogador (OG-472): o dono do perfil em azul e o outro em vermelho, no mesmo período e
 * formato; tabela com o percentil de cada um, a barra de vantagem e "X leva N eixos".
 */
function StyleCompare({ left, rightName, scope, format }: { left: StyleResponse; rightName: string; scope: string; format: FormatFilter }) {
  const { t } = usePrefs();
  const res = useApi<StyleResponse>(`/players/${encodeURIComponent(rightName)}/style?${scope}`, true, 'matches');
  const right = res.data;
  if (!right) return right === null ? <p className="ui-muted">{t('Player $1 not found.', rightName)}</p> : <Status loading={right === undefined} missing={false} error={res.error} />;
  const a = radarSeries('a', left.username, left.radar, { color: 'var(--text-team-blue)' });
  const b = radarSeries('b', right.username, right.radar, { color: 'var(--text-team-red)' });
  const leads = a && b ? axisLeads(a.axes, b.axes) : null;
  const pct = (s: RadarSeries | null, axis: StyleAxis) => s?.axes.find((x) => x.axis === axis)?.percentile;
  const missing = (r: StyleResponse) => (
    <p className="ui-muted">{t('$1 has no radar yet: $2 of $3 Ranked matches in the period.', r.username, String(r.radar.games), String(STYLE_MINIMUM_GAMES))}</p>
  );
  return (
    <div className="ui-stack">
      <div className="ui-row style-compare-heads">
        <div className="ui-stack style-side blue">
          <strong>{left.username}</strong>
          <ArchetypeLine radar={left.radar} />
          {!a && missing(left)}
        </div>
        <div className="ui-stack style-side red">
          <strong>{right.username}</strong>
          <ArchetypeLine radar={right.radar} />
          {!b && missing(right)}
        </div>
      </div>
      <StyleRadar caption={t('$1 vs $2', left.username, right.username)} series={[a, b].filter((s): s is RadarSeries => s !== null)} />
      <ShareStyleButton sides={[left, right]} format={format} />
      {leads && (
        <p>
          {leads.a === leads.b
            ? t('Even: $1 axes each', String(leads.a))
            : t('$1 leads $2 of 6 axes', leads.a > leads.b ? left.username : right.username, String(Math.max(leads.a, leads.b)))}
        </p>
      )}
      {a && b && (
        <Table
          caption={t('$1 vs $2', left.username, right.username)}
          rows={STYLE_AXES}
          rowKey={(x) => x}
          columns={[
            { key: 'axis', header: t('Axis'), cell: (x) => t(AXIS_LABELS[x]) },
            { key: 'a', header: left.username, align: 'end', cell: (x) => pct(a, x) ?? '—' },
            {
              key: 'bar',
              header: t('Advantage'),
              cell: (x) => {
                const diff = (pct(a, x) ?? 0) - (pct(b, x) ?? 0);
                return (
                  <span className="style-bar" aria-label={diff === 0 ? t('Even') : t('$1 by $2', diff > 0 ? left.username : right.username, String(Math.abs(diff)))}>
                    <i className={diff >= 0 ? 'blue' : 'red'} style={{ width: `${Math.abs(diff) / 2}%`, [diff >= 0 ? 'right' : 'left']: '50%' }} />
                  </span>
                );
              },
            },
            { key: 'b', header: right.username, align: 'end', cell: (x) => pct(b, x) ?? '—' },
          ]}
        />
      )}
    </div>
  );
}
