// SPDX-License-Identifier: GPL-2.0-or-later
// Estatísticas na página do clã (OG-273, RN-CLA-06): partidas e séries clã x clã, adversários mais
// frequentes com o retrospecto e os números dos membros pelo clã, na temporada atual ou no geral.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import { Tabs } from '../ui/Tabs.js';
import { duration, PlayerLink, Status, useApi } from './stats.js';

interface Totals {
  matches: number;
  kills: number;
  captures: number;
  playSeconds: number;
}
interface ClanStats {
  season: { id: number; name: string } | null;
  war: { matches: number; wins: number; losses: number; draws: number; capturesFor: number; capturesAgainst: number; series: number; seriesWon: number };
  opponents: { tag: string; name: string; matches: number; wins: number; losses: number; draws: number }[];
  totals: Totals;
  members: (Totals & { username: string })[];
}

export function ClanStatsPanels({ base }: { readonly base: string }) {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<'season' | 'all'>('season');
  const seasons = useApi<{ seasons: { id: number; active: boolean }[] }>('/seasons');
  const active = seasons.data?.seasons.find((s) => s.active);
  // sem temporada ativa, "Temporada atual" mostra o geral
  const path = period === 'season' && active ? `${base}/stats?season=${active.id}` : `${base}/stats`;
  const stats = useApi<ClanStats>(path, true);
  const s = period === 'season' && seasons.data === undefined ? undefined : stats.data;
  const w = s?.war;
  return (
    <Panel title={t('Statistics')}>
      <Tabs
        label={t('Period')}
        value={period}
        onChange={setPeriod}
        tabs={[
          { id: 'season', label: t('Current season') },
          { id: 'all', label: t('All seasons') },
        ]}
      >
        {!s || !w ? (
          <Status loading={!stats.error} missing={false} error={stats.error} />
        ) : (
          <>
            <h3 className="clan-stats-heading">{t('Clan vs clan')}</h3>
            <dl className="ui-pairs profile-numbers">
              {(
                [
                  [t('Matches'), w.matches],
                  [t('Wins'), w.wins],
                  [t('Losses'), w.losses],
                  [t('Draws'), w.draws],
                  [t('Captures'), `${w.capturesFor} × ${w.capturesAgainst}`],
                  [t('Series won'), `${w.seriesWon}/${w.series}`],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <Table
              caption={t('Opponents')}
              rows={s.opponents}
              rowKey={(o) => o.tag}
              onRowActivate={(o) => void navigate(`/clans/${encodeURIComponent(o.tag)}`)}
              empty={t('No clan vs clan match yet.')}
              columns={[
                { key: 'clan', header: t('Opponents'), cell: (o) => `(${o.tag}) ${o.name}` },
                { key: 'matches', header: t('Matches'), cell: (o) => o.matches, align: 'end' },
                { key: 'record', header: `${t('Wins')}/${t('Draws')}/${t('Losses')}`, cell: (o) => `${o.wins}/${o.draws}/${o.losses}`, align: 'end' },
              ]}
            />
            <h3 className="clan-stats-heading">{t('Members for the clan')}</h3>
            <Table
              caption={t('Members for the clan')}
              rows={s.members}
              rowKey={(m) => m.username}
              onRowActivate={(m) => void navigate(`/players/${encodeURIComponent(m.username)}`)}
              empty={t('No matches yet.')}
              columns={[
                { key: 'name', header: t('Player'), cell: (m) => <PlayerLink name={m.username} username={m.username} /> },
                { key: 'matches', header: t('Matches'), cell: (m) => m.matches, align: 'end' },
                { key: 'kills', header: t('Kills'), cell: (m) => m.kills, align: 'end' },
                { key: 'captures', header: t('Captures'), cell: (m) => m.captures, align: 'end' },
                { key: 'time', header: t('Playing time'), cell: (m) => duration(m.playSeconds), align: 'end', hideOnPhone: true },
              ]}
            />
            <p className="ui-muted">{t('$1 matches as a clan · $2 kills · $3 captures', String(s.totals.matches), String(s.totals.kills), String(s.totals.captures))}</p>
          </>
        )}
      </Tabs>
    </Panel>
  );
}
