// SPDX-License-Identifier: GPL-2.0-or-later
// Radar do clã (OG-473, RN-RAD-05): mediana dos membros pelas ranqueadas jogadas pelo clã, na cor
// do clã, com arquétipo, ponto forte e fraco, e um mini radar por membro. Com um rival (OG-474):
// o clã só nas partidas contra ele por cima do geral, ou o clã x o rival, mediana contra mediana.
import { useState } from 'react';
import { usePrefs } from '../app/prefs.js';
import { Badge } from '../ui/Button.js';
import { ChoiceField } from '../ui/Field.js';
import { Panel } from '../ui/Panel.js';
import { StyleRadar, type RadarSeries } from '../ui/StyleRadar.js';
import { ARCHETYPE_LABELS, AXIS_LABELS, axisEdges, STYLE_AXES, type Archetype, type StyleAxis, type StyleRadarData } from '../ui/style-radar.js';
import { Tabs } from '../ui/Tabs.js';
import { RadarHelp } from './style-panel.js';
import { PlayerLink, Status, useApi } from './stats.js';

export interface ClanStyle {
  tag: string;
  matches: number;
  lowSample: boolean;
  clan: { axes: { axis: StyleAxis; percentile: number }[]; archetype: Archetype; strongest: StyleAxis; weakest: StyleAxis; members: number } | null;
  members: { username: string; radar: StyleRadarData }[];
}

/** Eixos do clã no formato do componente (sem valor bruto: a mediana é de percentis). */
export const clanAxes = (c: NonNullable<ClanStyle['clan']>) => c.axes.map((a) => ({ ...a, value: 0 }));

export function ClanStylePanel({ base, color }: { readonly base: string; readonly color?: string | undefined }) {
  const { t } = usePrefs();
  const [period, setPeriod] = useState<'season' | 'all'>('season');
  const [rival, setRival] = useState('');
  const [mode, setMode] = useState<'against' | 'versus'>('against');
  const q = period === 'all' ? 'overall=true' : '';
  const res = useApi<ClanStyle>(`${base}/style?${q}`, true, 'matches');
  const opponents = useApi<{ opponents: { tag: string; name: string; matches: number }[] }>(`${base}/stats`, true);
  const vsRival = useApi<ClanStyle>(rival && mode === 'against' ? `${base}/style?${q}&against=${encodeURIComponent(rival)}` : '', true);
  const rivalClan = useApi<ClanStyle>(rival && mode === 'versus' ? `/clans/${encodeURIComponent(rival)}/style?${q}` : '', true);
  const d = res.data;
  const clanSeries = (c: ClanStyle | null | undefined, key: string, extra: Partial<RadarSeries> = {}): RadarSeries | null =>
    c?.clan ? { key, label: c.tag, axes: clanAxes(c.clan), percentOnly: true, ...(color ? { color } : {}), ...extra } : null;
  const second =
    mode === 'against'
      ? clanSeries(vsRival.data, 'against', { label: t('Against $1', rival), color: 'var(--accent)', dashed: vsRival.data?.lowSample ?? false })
      : clanSeries(rivalClan.data, 'rival', { color: 'var(--text-team-red)' });
  const main = clanSeries(d, 'clan');
  const edges = mode === 'versus' && d?.clan && rivalClan.data?.clan ? axisEdges(d.clan.axes, rivalClan.data.clan.axes) : null;
  return (
    <Panel title={t('Play style')}>
      <Tabs
        label={t('Period')}
        value={period}
        onChange={setPeriod}
        tabs={[
          { id: 'season', label: t('Current season') },
          { id: 'all', label: t('All time') },
        ]}
      >
        {!d ? (
          <Status loading={d === undefined} missing={d === null} error={res.error} />
        ) : (
          <div className="ui-stack">
            {d.clan ? (
              <>
                <div className="ui-row">
                  <Badge tone="accent">{t(ARCHETYPE_LABELS[d.clan.archetype])}</Badge>
                  <span>{t('Strong point: $1', t(AXIS_LABELS[d.clan.strongest]))}</span>
                  <span>{t('Weak point: $1', t(AXIS_LABELS[d.clan.weakest]))}</span>
                  <span className="ui-muted">{t('Median of $1 members', String(d.clan.members))}</span>
                </div>
                <StyleRadar caption={t('Play style of $1', d.tag)} series={[main, rival ? second : null].filter((s): s is RadarSeries => s !== null)} />
              </>
            ) : (
              <p className="ui-muted">{t('No member has 3 Ranked matches for the clan in the period yet.')}</p>
            )}
            {(opponents.data?.opponents.length ?? 0) > 0 && (
              <div className="ui-row">
                <ChoiceField
                  label={t('Rival')}
                  value={rival}
                  onChange={setRival}
                  options={[{ value: '', label: t('None') }, ...(opponents.data?.opponents ?? []).map((o) => ({ value: o.tag, label: `${o.tag} · ${o.name}` }))]}
                />
                {rival && (
                  <ChoiceField
                    label={t('Compare')}
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'against', label: t('Us against them') },
                      { value: 'versus', label: t('Us x them') },
                    ]}
                  />
                )}
              </div>
            )}
            {rival && mode === 'against' && vsRival.data && (
              <p className="ui-muted">
                {vsRival.data.clan ? t('$1 matches against $2.', String(vsRival.data.matches), rival) : t('Not enough matches against $1 for a radar yet.', rival)}
                {vsRival.data.clan && vsRival.data.lowSample ? ` ${t('Few matches')}.` : ''}
              </p>
            )}
            {edges && (
              <ul className="matchup-edges">
                {STYLE_AXES.map((axis) => (
                  <li key={axis} className={edges[axis]}>
                    <span>{t(AXIS_LABELS[axis])}</span>
                    <strong>{edges[axis] === 'even' ? t('Even') : edges[axis] === 'a' ? d.tag : rival}</strong>
                  </li>
                ))}
              </ul>
            )}
            {d.members.length > 0 && (
              <ul className="clan-style-members">
                {d.members.map((m) => (
                  <li key={m.username}>
                    <StyleRadar mini caption={t('Play style of $1', m.username)} series={m.radar.axes ? [{ key: 'm', label: m.username, axes: m.radar.axes, dashed: m.radar.lowSample, ...(color ? { color } : {}) }] : []} empty="—" />
                    <PlayerLink name={m.username} username={m.username} />
                    <span className="ui-muted">
                      {m.radar.archetype ? t(ARCHETYPE_LABELS[m.radar.archetype]) : t('$1 Ranked matches', String(m.radar.games))}
                      {m.radar.axes && m.radar.lowSample ? ` · ${t('Few matches')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="ui-muted">{t('Only Ranked matches played for the clan count; members need 3 of them to enter the median.')}</p>
            <RadarHelp />
          </div>
        )}
      </Tabs>
    </Panel>
  );
}
