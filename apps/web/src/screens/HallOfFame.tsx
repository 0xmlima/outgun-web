// SPDX-License-Identifier: GPL-2.0-or-later
// Hall da fama (OG-268, OG-354) em /hall-da-fama: para cada temporada encerrada, os 3 primeiros de
// cada stat principal do leaderboard e dos clãs, guardados na virada (desde 2026-11, D-66); as
// temporadas anteriores mostram o ranking clássico (geral e formatos). Também os selos de pódio que
// o perfil e a página do clã mostram.
import { Link, useNavigate } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Badge } from '../ui/Button.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { STAT_LABELS, statValue } from './leaderboard.js';
import { Status, useApi } from './stats.js';
import { ClanBadge } from '../ui/Emblem.js';
import { cupTitle } from './outcup.js';

interface Champion {
  position: number;
  name: string;
  clanName: string | null;
  clanTag: string | null;
  value: number;
}
interface Hall {
  /** `boards` na ordem de exibição: `stat:<id>` e `clans` (ou os quadros do ranking clássico). */
  seasons: { id: number; name: string; endsAt: string | null; classic: boolean; boards: Record<string, Champion[]> }[];
}

/** Pódio no hall da fama, como a API manda no perfil e no clã. */
export interface SeasonTitle {
  season: string;
  board: string;
  position: number;
}

type T = ReturnType<typeof usePrefs>['t'];
const statOf = (b: string) => (b.startsWith('stat:') ? b.slice(5) : null);
const boardName = (b: string, t: T) => {
  const stat = statOf(b);
  if (stat === 'overall') return t('Best of the month');
  if (stat) return t(STAT_LABELS[stat] ?? stat);
  return b === 'overall' ? t('Overall') : b === 'clans' ? t('Clans') : b;
};
/** Quadros do ranking clássico por score/neg (até 2026-10, D-66). */
const classicBoard = (b: string) => b === 'overall' || b === '3x3' || b === '4x4' || b === '5x5';
const placeName = (p: number, t: T) => (p === 1 ? t('Champion') : p === 2 ? t('2nd place') : t('3rd place'));

/** Selos "Campeão 3x3 · Temporada 2026-11" (o quadro de clãs dispensa o nome do quadro). */
export function TitleBadges({ titles }: { readonly titles: readonly SeasonTitle[] }) {
  const { t } = usePrefs();
  if (titles.length === 0) return null;
  return (
    <>
      {titles.map((x) => (
        <Link key={`${x.season}-${x.board}`} to="/hall-da-fama">
          <Badge tone={x.position === 1 ? 'accent' : 'neutral'}>
            {x.board === 'stat:overall'
              ? x.position === 1
                ? t('Best of the month')
                : t('$1 overall of the month', placeName(x.position, t))
              : x.board === 'clans'
                ? placeName(x.position, t)
                : `${placeName(x.position, t)} ${statOf(x.board) ? t('in $1', boardName(x.board, t).toLowerCase()) : boardName(x.board, t).toLowerCase()}`}{' '}
            · {x.season}
            {classicBoard(x.board) && ` (${t('classic ranking')})`}
          </Badge>
        </Link>
      ))}
    </>
  );
}

export function HallOfFameScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const hall = useApi<Hall>('/hall-of-fame');
  const h = hall.data;
  return (
    <Page title={t('Hall of fame')} subtitle={t('The top 3 of every month in each main stat of the leaderboard and among clans.')} onBack={() => void navigate(-1)}>
      <Status loading={h === undefined} missing={h === null} error={hall.error} />
      <CupHall />
      {h && h.seasons.length === 0 && <p className="ui-muted">{t('No finished season yet.')}</p>}
      {h?.seasons.map((s) => (
        <Panel key={s.id} title={s.classic ? `${s.name} · ${t('classic ranking')}` : s.name}>
          <div className="hall-boards">
            {Object.keys(s.boards).map((b) => (
              <section key={b} className="hall-board" aria-label={`${s.name} · ${boardName(b, t)}`}>
                <h3>{boardName(b, t)}</h3>
                {(s.boards[b] ?? []).length === 0 ? (
                  <p className="ui-muted">{t('Nobody qualified.')}</p>
                ) : (
                  <ol>
                    {(s.boards[b] ?? []).map((c) => (
                      <li key={c.position} className={c.position === 1 ? 'hall-first' : undefined}>
                        {b === 'clans' ? (
                          c.clanTag ? (
                            <Link to={`/clans/${encodeURIComponent(c.clanTag)}`}><ClanBadge tag={c.clanTag} size={20} />{`(${c.name}) ${c.clanName ?? ''}`}</Link>
                          ) : (
                            `(${c.name}) ${c.clanName ?? ''}`
                          )
                        ) : (
                          <Link to={`/players/${encodeURIComponent(c.name)}`}>{c.name}</Link>
                        )}
                        <span className="ui-muted">{b === 'clans' ? t('$1 points', String(c.value)) : statOf(b) ? statValue(statOf(b)!, c.value, prefs.locale) : c.value.toFixed(2)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
        </Panel>
      ))}
    </Page>
  );
}

/** Campeões e vices de cada edição encerrada da OutCup (RN-CUP-13). */
function CupHall() {
  const { t, prefs } = usePrefs();
  const res = useApi<{ cups: { edition: string; status: string; champion: string[] | null; runnerUp: string[] | null }[] }>('/cups', true, 'cup');
  const done = (res.data?.cups ?? []).filter((c) => c.status === 'finished' && c.champion);
  if (done.length === 0) return null;
  const pair = (names: string[]) =>
    names.map((n, i) => (
      <span key={n}>
        {i > 0 && ' + '}
        <Link to={`/players/${encodeURIComponent(n)}`}>{n}</Link>
      </span>
    ));
  return (
    <Panel title="OutCup">
      <ol className="outcup-archive">
        {done.map((c) => (
          <li key={c.edition}>
            <Link to={`/outcup/${c.edition}`}>{cupTitle(c.edition, prefs.locale)}</Link>
            <span>
              {t('Champions')}: {pair(c.champion!)}
            </span>
            {c.runnerUp && (
              <span className="ui-muted">
                {t('OutCup runner-up')}: {pair(c.runnerUp)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
