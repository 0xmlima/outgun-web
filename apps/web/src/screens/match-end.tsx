// SPDX-License-Identifier: GPL-2.0-or-later
// Fim de partida num modal (OG-344, D-63): resultado do meu time, placar, motivo, números de cada
// jogador e, no Ranked, o placar da série. Fecha pelo botão, Esc, clique fora ou em 10 s; quem abre
// decide o destino (lobby da série, menu ou o próximo mapa do Casual).
import type { ClientSession } from '@outgun/netcode';
import { useEffect, useState } from 'react';
import { api } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { currentStats, playersInOrder } from '../game/hud/info-screens.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { signedDelta, type MatchPage, type SkillChange } from './stats.js';

/** Segundos até o modal fechar sozinho. */
export const MATCH_END_SECONDS = 10;

export interface MatchSummary {
  /** Resultado do meu time; null sem time (fora dos slots). */
  readonly outcome: 'win' | 'loss' | 'draw' | null;
  readonly red: number;
  readonly blue: number;
  readonly reason: 'captureLimit' | 'timeOut' | 'extraTimeOut' | 'vote';
  readonly me: number;
  readonly players: readonly { pid: number; name: string; team: 0 | 1; frags: number; captures: number; kills: number; deaths: number; returns: number }[];
  /** Série Ranked (md3/md5) depois deste jogo. */
  readonly series: { bestOf: number; red: number; blue: number; finished: boolean } | null;
  /** O clã que cada lado foi nesta rodada (OG-409): tag e cor (null = vermelho/azul). */
  readonly teams?: readonly [{ tag: string; name: string; color: string | null } | null, { tag: string; name: string; color: string | null } | null];
}

/** Retrato do fim de partida a partir da sessão (null fora do fim de partida). */
export function matchSummary(s: ClientSession): MatchSummary | null {
  const go = s.gameOver;
  if (!go) return null;
  const teamOf = (pid: number): 0 | 1 => (s.maxPlayers && pid >= s.maxPlayers / 2 ? 1 : 0);
  const mine = s.me >= 0 && s.me < s.maxPlayers ? teamOf(s.me) : null;
  const outcome = mine === null ? null : go.red === go.blue ? 'draw' : (go.red > go.blue) === (mine === 0) ? 'win' : 'loss';
  const players = playersInOrder(s).map((pid) => {
    const st = currentStats(s, pid);
    return { pid, name: s.names.get(pid) ?? '', team: teamOf(pid), frags: s.frags.get(pid) ?? st?.frags ?? 0, captures: st?.captures ?? 0, kills: st?.kills ?? 0, deaths: st?.deaths ?? 0, returns: st?.flagsReturned ?? 0 };
  });
  const l = s.lobby;
  const series = l && l.bestOf > 1 ? { bestOf: l.bestOf, red: l.seriesRed, blue: l.seriesBlue, finished: l.phase === 'finished' } : null;
  const id = (team: 0 | 1) => (s.teamIdentity?.[team] ? { tag: s.teamIdentity[team]!.tag, name: s.teamIdentity[team]!.name, color: s.teamIdentity[team]!.color } : null);
  return { outcome, red: go.red, blue: go.blue, reason: go.reason, me: s.me, players, series, teams: [id(0), id(1)] };
}

const REASONS: Record<MatchSummary['reason'], string> = {
  captureLimit: 'Capture limit reached',
  timeOut: 'Time is up',
  extraTimeOut: 'End of extra time',
  vote: 'Map changed by vote',
};

const OUTCOMES = { win: 'Victory', loss: 'Defeat', draw: 'Draw' } as const;

/** Onde buscar a variação do meu rating (OG-351): a sala, desde quando e a minha conta. */
export interface RatingLookup {
  readonly room: string;
  readonly after: string;
  readonly username: string;
}

/** Variação do meu rating na ranqueada que acabou: espera a API gravar o resultado (poucas tentativas). */
function useMyRatingChange(lookup: RatingLookup | undefined): SkillChange | undefined {
  const [change, setChange] = useState<SkillChange>();
  useEffect(() => {
    if (!lookup) return;
    let alive = true;
    let tries = 0;
    const attempt = async () => {
      try {
        const { id } = await api<{ id: string }>(`/rooms/${encodeURIComponent(lookup.room)}/last-match?${new URLSearchParams({ after: lookup.after })}`);
        const page = await api<MatchPage>(`/matches/${encodeURIComponent(id)}`);
        const mine = page.skill?.find((c) => c.username === lookup.username);
        if (alive && mine) setChange(mine);
      } catch {
        if (alive && ++tries < 4) setTimeout(() => void attempt(), 1500);
      }
    };
    const first = setTimeout(() => void attempt(), 1000);
    return () => {
      alive = false;
      clearTimeout(first);
    };
  }, [lookup]);
  return change;
}

export function MatchEndDialog({ summary, onClose, onReport, rating }: { summary: MatchSummary; onClose: () => void; onReport?: () => void; rating?: RatingLookup }) {
  const { t } = usePrefs();
  const change = useMyRatingChange(rating);
  const [left, setLeft] = useState(MATCH_END_SECONDS);
  useEffect(() => {
    const started = performance.now();
    const id = setInterval(() => {
      const rest = Math.max(0, MATCH_END_SECONDS - Math.floor((performance.now() - started) / 1000));
      setLeft(rest);
      if (rest === 0) onClose();
    }, 250);
    return () => clearInterval(id);
  }, [onClose]);
  const title = summary.outcome ? t(OUTCOMES[summary.outcome]) : t('Game over');
  return (
    <Dialog
      open
      className={`match-end${summary.outcome ? ` match-end-${summary.outcome}` : ''}`}
      title={title}
      onClose={onClose}
      closeLabel={t('Close')}
      actions={
        <>
          {onReport && (
            <Button variant="ghost" onClick={onReport}>
              {t('View match report')}
            </Button>
          )}
          <Button variant="primary" onClick={onClose} autoFocus>
            {t('Continue ($1)', String(left))}
          </Button>
        </>
      }
    >
      <p className="match-end-score">
        <span className="team-red" style={summary.teams?.[0]?.color ? { color: summary.teams[0].color } : undefined}>
          {(summary.teams?.[0]?.name || summary.teams?.[0]?.tag) ?? t('Red')} {summary.red}
        </span>{' '}
        ×{' '}
        <span className="team-blue" style={summary.teams?.[1]?.color ? { color: summary.teams[1].color } : undefined}>
          {summary.blue} {(summary.teams?.[1]?.name || summary.teams?.[1]?.tag) ?? t('Blue')}
        </span>
      </p>
      <p className="ui-muted match-end-reason">{t(REASONS[summary.reason])}</p>
      {change && (
        <p className="match-end-rating">
          {t('Rating')}: <strong>{signedDelta(change.after - change.before)}</strong> ({change.after}) · {t('your team had $1% to win', String(Math.round(100 * change.winChance)))}
        </p>
      )}
      {summary.series && (
        <p className="match-end-series">
          {summary.series.finished ? t('Series over') : t('Series')}: {t('Red')} {summary.series.red} × {summary.series.blue} {t('Blue')} · {t('Best of $1', String(summary.series.bestOf))}
        </p>
      )}
      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>{t('Player')}</th>
              <th className="end">{t('Frags')}</th>
              <th className="end">{t('Captures')}</th>
              <th className="end">{t('Kills')}</th>
              <th className="end">{t('Deaths')}</th>
              <th className="end">{t('Returns')}</th>
            </tr>
          </thead>
          <tbody>
            {summary.players.map((p) => (
              <tr key={p.pid} className={p.pid === summary.me ? 'match-end-me' : undefined}>
                <td className={p.team === 0 ? 'team-red' : 'team-blue'}>{p.name}</td>
                <td className="end">{p.frags}</td>
                <td className="end">{p.captures}</td>
                <td className="end">{p.kills}</td>
                <td className="end">{p.deaths}</td>
                <td className="end">{p.returns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
