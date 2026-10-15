// SPDX-License-Identifier: GPL-2.0-or-later
// Hall da fama (OG-268, RN-RKL-24) em /hall-da-fama: para cada temporada encerrada, os 3 primeiros
// do geral, de cada formato e dos clãs, guardados na virada (OG-267). Também os selos de pódio que
// o perfil e a página do clã mostram.
import { Link, useNavigate } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Badge } from '../ui/Button.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Status, useApi } from './stats.js';

type Board = 'overall' | '3x3' | '4x4' | '5x5' | 'clans';
const BOARDS: readonly Board[] = ['overall', '3x3', '4x4', '5x5', 'clans'];

interface Champion {
  position: number;
  name: string;
  clanName: string | null;
  clanTag: string | null;
  value: number;
}
interface Hall {
  seasons: { id: number; name: string; endsAt: string | null; boards: Record<Board, Champion[]> }[];
}

/** Pódio no hall da fama, como a API manda no perfil e no clã. */
export interface SeasonTitle {
  season: string;
  board: string;
  position: number;
}

type T = ReturnType<typeof usePrefs>['t'];
const boardName = (b: string, t: T) => (b === 'overall' ? t('Overall') : b === 'clans' ? t('Clans') : b);
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
            {x.board === 'clans' ? placeName(x.position, t) : `${placeName(x.position, t)} ${boardName(x.board, t).toLowerCase()}`} · {x.season}
          </Badge>
        </Link>
      ))}
    </>
  );
}

export function HallOfFameScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const hall = useApi<Hall>('/hall-of-fame');
  const h = hall.data;
  return (
    <Page title={t('Hall of fame')} subtitle={t('The top 3 of every finished season: overall, in each format and among clans.')} onBack={() => void navigate(-1)}>
      <Status loading={h === undefined} missing={h === null} error={hall.error} />
      {h && h.seasons.length === 0 && <p className="ui-muted">{t('No finished season yet.')}</p>}
      {h?.seasons.map((s) => (
        <Panel key={s.id} title={s.name}>
          <div className="hall-boards">
            {BOARDS.map((b) => (
              <section key={b} className="hall-board" aria-label={`${s.name} · ${boardName(b, t)}`}>
                <h3>{boardName(b, t)}</h3>
                {s.boards[b].length === 0 ? (
                  <p className="ui-muted">{t('Nobody qualified.')}</p>
                ) : (
                  <ol>
                    {s.boards[b].map((c) => (
                      <li key={c.position} className={c.position === 1 ? 'hall-first' : undefined}>
                        {b === 'clans' ? (
                          c.clanTag ? (
                            <Link to={`/clans/${encodeURIComponent(c.clanTag)}`}>{`(${c.name}) ${c.clanName ?? ''}`}</Link>
                          ) : (
                            `(${c.name}) ${c.clanName ?? ''}`
                          )
                        ) : (
                          <Link to={`/players/${encodeURIComponent(c.name)}`}>{c.name}</Link>
                        )}
                        <span className="ui-muted">{b === 'clans' ? t('$1 points', String(c.value)) : c.value.toFixed(2)}</span>
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
