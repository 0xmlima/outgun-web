// SPDX-License-Identifier: GPL-2.0-or-later
// Radar do clã (OG-473, RN-RAD-05): mediana dos membros pelas ranqueadas jogadas pelo clã, na cor
// do clã, com arquétipo, ponto forte e fraco, e um mini radar por membro.
import { useState } from 'react';
import { usePrefs } from '../app/prefs.js';
import { Badge } from '../ui/Button.js';
import { Panel } from '../ui/Panel.js';
import { StyleRadar } from '../ui/StyleRadar.js';
import { ARCHETYPE_LABELS, AXIS_LABELS, type Archetype, type StyleAxis, type StyleRadarData } from '../ui/style-radar.js';
import { Tabs } from '../ui/Tabs.js';
import { RadarHelp } from './style-panel.js';
import { PlayerLink, Status, useApi } from './stats.js';

export interface ClanStyle {
  tag: string;
  clan: { axes: { axis: StyleAxis; percentile: number }[]; archetype: Archetype; strongest: StyleAxis; weakest: StyleAxis; members: number } | null;
  members: { username: string; radar: StyleRadarData }[];
}

/** Eixos do clã no formato do componente (sem valor bruto: a mediana é de percentis). */
export const clanAxes = (c: NonNullable<ClanStyle['clan']>) => c.axes.map((a) => ({ ...a, value: 0 }));

export function ClanStylePanel({ base, color }: { readonly base: string; readonly color?: string | undefined }) {
  const { t } = usePrefs();
  const [period, setPeriod] = useState<'season' | 'all'>('season');
  const res = useApi<ClanStyle>(`${base}/style${period === 'all' ? '?overall=true' : ''}`, true, 'matches');
  const d = res.data;
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
                <StyleRadar caption={t('Play style of $1', d.tag)} series={[{ key: 'clan', label: d.tag, axes: clanAxes(d.clan), percentOnly: true, ...(color ? { color } : {}) }]} />
              </>
            ) : (
              <p className="ui-muted">{t('No member has 3 Ranked matches for the clan in the period yet.')}</p>
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
