// SPDX-License-Identifier: GPL-2.0-or-later
// Tipos e utilitários das páginas de estatísticas (OG-085): perfil em Profile.tsx (OG-212), diretório e
// ranking em Players.tsx (OG-215), relatório de partida em MatchReport.tsx (OG-214).
import type { Bilingual } from '@outgun/content';
import { RANKED_FORMATS, type RankedFormat } from '@outgun/settings';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, ApiError } from '../app/api.js';
import { fallbackMs, useLive, useLiveConnected, type LiveTopic } from '../app/live.js';
import { usePrefs } from '../app/prefs.js';
import { Badge } from '../ui/Button.js';
import { Tabs } from '../ui/Tabs.js';

export type Mode = 'ranked' | 'casual';

export interface Totals {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  frags: number;
  kills: number;
  deaths: number;
  captures: number;
  assists: number;
  flagsReturned: number;
  carriersKilled: number;
  shots: number;
  hits: number;
  playSeconds: number;
}

export interface Profile {
  user: { id: string; username: string; clanTag: string | null; clanLabel: string | null; createdAt: string };
  /** Rating de habilidade OpenSkill (OG-349/351, RN-SKL-04); null antes da primeira ranqueada. */
  skill: Skill | null;
  totals: Record<Mode, Totals>;
  favoriteColors: number[];
  lastMatchAt: string | null;
  milestones: { id: string; achievedAt: string; matchId: string | null }[];
  /** Progresso, raridade e secretos desbloqueados (OG-393, RN-SOC-06). */
  milestoneProgress?: Record<string, number>;
  milestoneRarity?: Record<string, number>;
  secrets?: { total: number; unlocked: { id: string; name: Bilingual; description: Bilingual; firstBy: string | null }[] };
  /** Pódios no hall da fama (OG-268). */
  titles?: { season: string; board: string; position: number }[];
}

export interface MatchSummary {
  id: string;
  endedAt: string;
  mode: Mode;
  ranked: boolean;
  /** Formato do Ranked (OG-250); null em Casual e nas partidas anteriores aos formatos. */
  format: RankedFormat | null;
  /** Partida clã x clã (OG-259, RN-RKL-14). */
  clanWar?: boolean;
  /** Concluída com bot substituto / com um a menos (OG-263, RN-RKL-20). */
  withBots?: boolean;
  shortHanded?: boolean;
  map: string;
  mapTitle: string;
  redScore: number;
  blueScore: number;
}

export interface HistoryEntry extends MatchSummary {
  replayUrl: string | null;
  player: { team: number; frags: number; kills: number; deaths: number; captures: number; scoreDelta: number; negDelta: number };
}

export interface PlayerLine {
  slot: number;
  name: string;
  username: string | null;
  team: number;
  isBot: boolean;
  frags: number;
  kills: number;
  deaths: number;
  captures: number;
  playSeconds: number;
  scoreDelta: number;
  negDelta: number;
  stats: Record<string, number>;
}

export interface MatchDetails {
  mapTitle?: string;
  mapTime?: number;
  rules?: { captureLimit: number; winScoreDifference: number; timeLimit: number; extraTime: number; extraTimePeriods: number; suddenDeath: boolean };
  teams?: Record<string, number>[];
  captures?: { time: number; team: 0 | 1; capturer: string; assistant: string | null }[];
  baseScore?: [number, number];
}

export interface MatchPage {
  match: MatchSummary & { startedAt: string; roomId: string | null };
  /** O clã que cada lado foi na rodada (OG-409); null = vermelho x azul. */
  teams?: readonly ({ tag: string; name: string; color: string | null } | null)[] | null;
  details: MatchDetails;
  players: PlayerLine[];
  replayUrl: string | null;
  milestones?: { username: string; milestone: string; secretName?: Bilingual }[];
  /** Sala com formato (OG-257): formato, número do jogo e a série. */
  format?: string | null;
  gameNo?: number | null;
  series?: SeriesView | null;
  /** Clãs dos lados numa partida clã x clã (OG-259). */
  clans?: { red: ClanRef; blue: ClanRef } | null;
  /** Variação do rating de habilidade de cada conta (OG-351); vazio antes da implantação e no Casual. */
  skill?: SkillChange[];
}

export interface Skill {
  value: number;
  mu: number;
  sigma: number;
  matches: number;
  calibrating: boolean;
}

export interface SkillChange {
  username: string;
  team: number;
  before: number;
  after: number;
  /** Chance de vitória prevista do time, de 0 a 1. */
  winChance: number;
}

/** "+29" / "−20" / "±0". */
export const signedDelta = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `-${-n}` : '±0');

export interface ClanRef {
  tag: string;
  name: string;
}

/** Série Ranked (OG-257, `GET /series/:id`). */
export interface SeriesView {
  id: string;
  format: string;
  bestOf: 1 | 3 | 5;
  games: number;
  redWins: number;
  blueWins: number;
  winner: 0 | 1 | null;
  finished: boolean;
  startedAt: string;
  matches: { id: string; gameNo: number | null; mapTitle: string; redScore: number; blueScore: number; endedAt: string; withBots?: boolean; shortHanded?: boolean }[];
}

/** Carrega `path` da API; `null` = não encontrado. `keep` mantém os dados anteriores enquanto troca de filtro. */
/** Selos de partida Ranked com desconexão permanente (OG-263, RN-RKL-20); nada na partida normal. */
export function SubstitutionBadges({ withBots, shortHanded }: { withBots?: boolean | undefined; shortHanded?: boolean | undefined }) {
  const { t } = usePrefs();
  return (
    <>
      {withBots && <Badge tone="warning">{t('Completed with bots')}</Badge>}
      {shortHanded && <Badge tone="warning">{t('Short-handed')}</Badge>}
    </>
  );
}

/**
 * Releitura das telas do portal (OG-283): a cada minuto e ao voltar para a aba, trocando o dado no
 * lugar; com `topic`, também a cada aviso do portal ao vivo (OG-284).
 */
export const API_REFRESH_MS = 60_000;

export function useApi<T>(path: string, keep = false, topic: LiveTopic | null = null): { data: T | null | undefined; error: string | null } {
  const [state, setState] = useState<{ data: T | null | undefined; error: string | null }>({ data: undefined, error: null });
  // aviso ao vivo: relê no lugar, sem apagar a tela
  const current = useRef(path);
  current.current = path;
  useLive(topic, () => {
    const at = current.current;
    api<T>(at).then(
      (data) => current.current === at && setState({ data, error: null }),
      () => undefined,
    );
  });
  const every = fallbackMs(API_REFRESH_MS, useLiveConnected() && topic !== null);
  useEffect(() => {
    let alive = true;
    if (!keep) setState({ data: undefined, error: null });
    api<T>(path).then(
      (data) => alive && setState({ data, error: null }),
      (e: unknown) => alive && setState(e instanceof ApiError && e.status === 404 ? { data: null, error: null } : { data: undefined, error: e instanceof ApiError ? e.message : String(e) }),
    );
    // releitura em segundo plano: erro passageiro não apaga o que está na tela
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      api<T>(path).then(
        (data) => alive && setState({ data, error: null }),
        () => undefined,
      );
    };
    const id = setInterval(refresh, every);
    addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      clearInterval(id);
      removeEventListener('visibilitychange', refresh);
    };
  }, [path, keep, every]);
  return state;
}

/** `m:ss`, como o tempo de bandeira e das capturas do original. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.trunc(seconds));
  return `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Duração longa: `1 h 05 min` ou `12 min`. */
export function duration(seconds: number): string {
  const min = Math.round(seconds / 60);
  return min >= 60 ? `${Math.trunc(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
}

export const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : '-');

export const date = (iso: string, locale: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

export function Status({ loading, missing, error }: { loading: boolean; missing: boolean; error: string | null }) {
  const { t } = usePrefs();
  if (error) return <p className="stats-note error">{t('Could not reach the server.')}</p>;
  if (missing) return <p className="stats-note">{t('Not found.')}</p>;
  if (loading) return <p className="stats-note">{t('Loading...')}</p>;
  return null;
}

export function PlayerLink({ name, username }: { name: string; username: string | null }) {
  return username ? <Link to={`/players/${encodeURIComponent(username)}`}>{name}</Link> : <>{name}</>;
}

export type FormatFilter = RankedFormat | 'all';

/** Filtro de formato do Ranked guardado na URL (`?format=3x3`, OG-258); sem ele, "Todos". */
export function useFormatParam(): [FormatFilter, (f: FormatFilter) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('format');
  const format = RANKED_FORMATS.find((f) => f === raw) ?? 'all';
  const set = (f: FormatFilter) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (f === 'all') next.delete('format');
        else next.set('format', f);
        return next;
      },
      { replace: true },
    );
  return [format, set];
}

/** `&format=3x3` para as rotas da API; vazio em "Todos". */
export const formatQuery = (f: FormatFilter) => (f === 'all' ? '' : `&format=${f}`);

/** Abas "Todos / 3x3 / 4x4 / 5x5" (RN-RKL-13). */
export function FormatTabs({ value, onChange }: { value: FormatFilter; onChange: (f: FormatFilter) => void }) {
  const { t } = usePrefs();
  return (
    <div className="ui-row format-filter">
      <Tabs label={t('Format')} value={value} onChange={onChange} tabs={[{ id: 'all', label: t('All formats') }, ...RANKED_FORMATS.map((f) => ({ id: f, label: f }))]} />
      {value !== 'all' && <span className="ui-muted">{t('Matches from before the formats only show under "All".')}</span>}
    </div>
  );
}
