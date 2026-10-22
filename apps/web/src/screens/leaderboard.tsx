// SPDX-License-Identifier: GPL-2.0-or-later
// Leaderboard de atributos (OG-353, D-66, RN-LDB): visão geral com os 3 primeiros de cada stat e a
// lista completa de um stat, com a posição de quem está logado. A lista de stats, a ordem e quais
// são os principais (hall da fama) vêm da API (OG-352); aqui ficam os rótulos e o formato dos valores.
import { chatName } from '@outgun/protocol';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import { clock, PlayerLink, Status, useApi } from './stats.js';

export type StatKind = 'rate' | 'ratio' | 'record' | 'average';

export interface StatEntry {
  position: number;
  username: string;
  clanTag: string | null;
  clanLabel: string | null;
  value: number;
  matches: number;
}

interface SeasonRef {
  id: number;
  name: string;
  active: boolean;
}

export interface StatOverview {
  season: SeasonRef | null;
  minimumMatches: number;
  stats: { stat: string; kind: StatKind; main: boolean; entries: StatEntry[] }[];
}

interface StatBoard {
  season: SeasonRef | null;
  stat: string;
  kind: StatKind;
  minimumMatches: number;
  total: number;
  entries: StatEntry[];
  me: StatEntry | null;
}

/** Nome de cada stat (chave em inglês, traduzida em `@outgun/i18n`). */
export const STAT_LABELS: Record<string, string> = {
  kills: 'Kills',
  captures: 'Captures',
  flagsReturned: 'Flags returned',
  flagCarryingTime: 'Flag carrying time',
  kd: 'K/D',
  accuracy: 'Accuracy',
  assists: 'Assists',
  carriersKilled: 'Carriers killed',
  flagsTaken: 'Flags taken',
  frags: 'Frags',
  damage: 'Raw damage',
  killStreak: 'Best kill streak',
  averageLifetime: 'Average lifetime',
};

/** Como cada forma de ranquear é explicada ao lado do nome (RN-LDB-02). */
export const KIND_NOTES: Record<StatKind, string> = {
  rate: 'per 10 minutes played',
  ratio: 'in the period',
  record: 'best match in the period',
  average: 'average in the period',
};

/** Valor de um stat como aparece na tabela. */
export function statValue(stat: string, value: number, locale: string): string {
  if (stat === 'accuracy') return `${Math.round(value * 100)}%`;
  if (stat === 'averageLifetime' || stat === 'flagCarryingTime') return clock(value);
  if (stat === 'killStreak' || stat === 'damage') return String(Math.round(value));
  return value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parâmetros de período e formato para a API: `current` (temporada ativa), `all` ou o id de uma temporada. */
export function statScope(period: string, format: string): URLSearchParams {
  const q = new URLSearchParams();
  if (period === 'all') q.set('overall', 'true');
  else if (period !== 'current') q.set('season', period);
  if (format !== 'all') q.set('format', format);
  return q;
}

/** Visão geral: um quadro por stat com os 3 primeiros; clicar abre a lista completa. */
export function StatOverviewView({ scope, onPick }: { scope: URLSearchParams; onPick: (stat: string) => void }) {
  const { t, prefs } = usePrefs();
  const board = useApi<StatOverview>(`/leaderboard/stats?${scope.toString()}`, true);
  const b = board.data;
  if (!b) return <Status loading={b === undefined} missing={b === null} error={board.error} />;
  return (
    <div className="leaderboard-grid">
      {b.stats.map((s) => (
        <Panel
          key={s.stat}
          title={t(STAT_LABELS[s.stat] ?? s.stat)}
          actions={
            <Button variant="ghost" onClick={() => onPick(s.stat)}>
              {t('See all')}
            </Button>
          }
        >
          <p className="ui-muted leaderboard-kind">
            {t(KIND_NOTES[s.kind])}
            {s.main && (
              <>
                {' '}
                <Badge tone="accent">{t('Hall of fame')}</Badge>
              </>
            )}
          </p>
          {s.entries.length === 0 ? (
            <p className="ui-muted">{t('Nobody with $1 matches yet.', String(b.minimumMatches))}</p>
          ) : (
            <ol className="leaderboard-top">
              {s.entries.map((e) => (
                <li key={e.username}>
                  <span className="leaderboard-pos">{e.position}º</span>
                  <PlayerLink name={chatName(e.username, e.clanLabel)} username={e.username} />
                  <strong>{statValue(s.stat, e.value, prefs.locale)}</strong>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      ))}
    </div>
  );
}

/** Lista completa de um stat, com a posição de quem está logado (se tiver o mínimo de partidas). */
export function StatDetailView({ stat, scope, me }: { stat: string; scope: URLSearchParams; me: string | undefined }) {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const [limit, setLimit] = useState(50);
  const q = new URLSearchParams(scope);
  q.set('limit', String(limit));
  if (me) q.set('player', me);
  const board = useApi<StatBoard>(`/leaderboard/stats/${encodeURIComponent(stat)}?${q.toString()}`, true);
  const b = board.data;
  if (!b) return <Status loading={b === undefined} missing={b === null} error={board.error} />;
  return (
    <Panel title={`${t(STAT_LABELS[stat] ?? stat)} · ${t(KIND_NOTES[b.kind])}`}>
      {me && (
        <p className="home-rank">
          {b.me ? t('You: $1º of $2 ($3)', String(b.me.position), String(b.total), statValue(stat, b.me.value, prefs.locale)) : t('You need $1 Ranked matches in the period to appear.', String(b.minimumMatches))}
        </p>
      )}
      <Table
        caption={t(STAT_LABELS[stat] ?? stat)}
        rows={b.entries}
        rowKey={(e) => e.username}
        onRowActivate={(e) => void navigate(`/players/${encodeURIComponent(e.username)}`)}
        empty={t('Nobody with $1 matches yet.', String(b.minimumMatches))}
        columns={[
          { key: 'pos', header: '#', cell: (e) => e.position, align: 'end' },
          { key: 'name', header: t('Player'), cell: (e) => <PlayerLink name={chatName(e.username, e.clanLabel)} username={e.username} /> },
          { key: 'value', header: t(STAT_LABELS[stat] ?? stat), cell: (e) => statValue(stat, e.value, prefs.locale), align: 'end' },
          { key: 'matches', header: t('Matches'), cell: (e) => e.matches, align: 'end' },
        ]}
      />
      {b.total > b.entries.length && limit < 100 && (
        <div className="ui-row">
          <Button variant="ghost" onClick={() => setLimit(100)}>
            {t('More')}
          </Button>
        </div>
      )}
    </Panel>
  );
}
