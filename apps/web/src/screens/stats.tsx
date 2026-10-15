// SPDX-License-Identifier: GPL-2.0-or-later
// Tipos e utilitários das páginas de estatísticas (OG-085): perfil em Profile.tsx (OG-212), diretório e
// ranking em Players.tsx (OG-215), relatório de partida em MatchReport.tsx (OG-214).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';

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
  user: { id: string; username: string; clanTag: string | null; createdAt: string };
  ranking: { season: string; score: number; neg: number; rating: number; rank: number; of: number; matches: number; minimumScore: number } | null;
  totals: Record<Mode, Totals>;
  favoriteColors: number[];
  lastMatchAt: string | null;
  milestones: { id: string; achievedAt: string; matchId: string | null }[];
}

export interface MatchSummary {
  id: string;
  endedAt: string;
  mode: Mode;
  ranked: boolean;
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
  details: MatchDetails;
  players: PlayerLine[];
  replayUrl: string | null;
  milestones?: { username: string; milestone: string }[];
}

export interface Leaderboard {
  season: { id: number; name: string; active: boolean };
  total: number;
  entries: { position: number; username: string; clanTag: string | null; score: number; neg: number; rating: number; matches: number }[];
}

/** Carrega `path` da API; `null` = não encontrado. */
export function useApi<T>(path: string): { data: T | null | undefined; error: string | null } {
  const [state, setState] = useState<{ data: T | null | undefined; error: string | null }>({ data: undefined, error: null });
  useEffect(() => {
    let alive = true;
    setState({ data: undefined, error: null });
    api<T>(path).then(
      (data) => alive && setState({ data, error: null }),
      (e: unknown) => alive && setState(e instanceof ApiError && e.status === 404 ? { data: null, error: null } : { data: undefined, error: e instanceof ApiError ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [path]);
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
