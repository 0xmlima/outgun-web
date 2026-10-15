// SPDX-License-Identifier: GPL-2.0-or-later
// Salas Ranked no cliente (OG-255, RN-RKL-05/06): a aba "Ranked" do lobby lista as salas de lobby
// (formato, série, ocupação, fase, cadeado e ping), filtra por formato e cria sala; a senha é pedida
// e conferida na própria lista. As salas Ranked sem formato (anteriores ao lobby) não aparecem.
import { RANKED_FORMATS, SERIES_LENGTHS, type RankedFormat, type SeriesBestOf } from '@outgun/settings';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAccount } from '../app/account.js';
import { api, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { JoinError, joinErrorText, requestTicket } from '../game/net/ticket.js';
import { defaultServerUrl } from '../game/net/connection.js';
import { Badge, Button } from '../ui/Button.js';
import { ChoiceField, TextField } from '../ui/Field.js';
import { Form, FormMessageLine, Page } from '../ui/Page.js';
import { Table } from '../ui/Table.js';
import { REFRESH_MS, type RoomSummary } from './lobby.js';

export type LobbyPhase = 'lobby' | 'vote' | 'ready' | 'countdown' | 'game' | 'finished';

export interface RankedRoom extends RoomSummary {
  format: RankedFormat;
  bestOf: SeriesBestOf;
  phase: LobbyPhase;
}

/** Só as salas de lobby (com formato), da fase mais aberta para a mais fechada e, nela, mais cheias antes. */
export function rankedRooms(rooms: readonly RoomSummary[]): RankedRoom[] {
  const order: Record<LobbyPhase, number> = { lobby: 0, vote: 1, ready: 1, countdown: 1, game: 2, finished: 3 };
  return rooms
    .filter((r): r is RankedRoom => Boolean((r as Partial<RankedRoom>).format))
    .sort((a, b) => order[a.phase] - order[b.phase] || b.players - a.players || a.name.localeCompare(b.name));
}

/** Rótulo da fase na lista (chave de tradução). */
export function phaseLabel(phase: LobbyPhase): string {
  switch (phase) {
    case 'lobby':
      return 'Waiting for players';
    case 'vote':
      return 'Map vote';
    case 'ready':
    case 'countdown':
      return 'Getting ready';
    case 'game':
      return 'In game';
    case 'finished':
      return 'Series over';
  }
}

/** Cadeado das salas com senha. */
function LockIcon({ label }: { label: string }) {
  return (
    <svg className="lobby-lock" viewBox="0 0 16 16" width="14" height="14" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
    </svg>
  );
}

const seriesLabel = (bestOf: SeriesBestOf) => (bestOf === 1 ? 'Single game' : `Best of ${bestOf}`);
const isFull = (r: RoomSummary) => r.online && r.players >= r.maxPlayers;

/** Aba Ranked do lobby. */
export function RankedRoomsPanel({ pings }: { pings: ReadonlyMap<string, number> }) {
  const { t } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const [format, setFormat] = useState<RankedFormat | 'all'>('all');
  const [rooms, setRooms] = useState<RankedRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Sala com senha escolhida: o campo aparece acima da tabela. */
  const [locked, setLocked] = useState<RankedRoom | null>(null);
  const [password, setPassword] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ rooms: RoomSummary[] }>(`/rooms?mode=ranked${format === 'all' ? '' : `&format=${format}`}`).then(
        (r) => {
          if (!alive) return;
          setRooms(rankedRooms(r.rooms));
          setError(null);
        },
        () => alive && setError(t('Could not reach the server.')),
      );
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [format, t]);

  const play = (room: RankedRoom, pass?: string) => void navigate(`/play?sala=${encodeURIComponent(room.id)}`, pass ? { state: { password: pass } } : undefined);
  const enter = (room: RankedRoom) => {
    if (!user) return void navigate('/login');
    if (isFull(room)) return;
    setJoinError(null);
    if (room.hasPassword) {
      setLocked(room);
      setPassword('');
      return;
    }
    setLocked(null);
    play(room);
  };
  // confere a senha na API antes de sair da lista (senha errada: erro aqui mesmo)
  const unlock = () => {
    if (!locked || !password || joining) return;
    setJoining(true);
    requestTicket(locked.id, user?.username ?? '', defaultServerUrl(), false, password).then(
      () => play(locked, password),
      (e: unknown) => {
        setJoining(false);
        const code = e instanceof JoinError || e instanceof ApiError ? e.code : 'unknown';
        setJoinError(t(joinErrorText(code)));
      },
    );
  };

  return (
    <div className="ui-stack lobby">
      <p className="ui-muted">{t('Ranked: no power-ups, account required, counts for the ranking.')}</p>
      <div className="lobby-actions">
        <Button variant="primary" size="lg" onClick={() => void navigate(user ? '/rooms/ranked/new' : '/login')}>
          {t('Create Ranked room')}
          {!user && <Badge>{t('needs an account')}</Badge>}
        </Button>
      </div>
      {error && <FormMessageLine message={{ text: error, error: true }} />}
      <div className="lobby-filters">
        <ChoiceField
          label={t('Format')}
          value={format}
          onChange={setFormat}
          options={[{ value: 'all' as const, label: t('All') }, ...RANKED_FORMATS.map((f) => ({ value: f, label: f }))]}
        />
      </div>
      {locked && (
        <Form
          label={t('Password')}
          onSubmit={unlock}
          actions={
            <>
              <Button type="submit" variant="primary" disabled={!password || joining}>
                {t('Join')}
              </Button>
              <Button variant="ghost" onClick={() => setLocked(null)}>
                {t('Cancel')}
              </Button>
            </>
          }
        >
          <TextField label={`${t('Password')}: ${locked.name}`} type="password" value={password} onChange={setPassword} maxLength={15} autoFocus error={joinError ?? undefined} />
        </Form>
      )}
      <Table
        caption={t('Ranked rooms')}
        rows={rooms ?? []}
        rowKey={(r) => r.id}
        onRowActivate={enter}
        empty={rooms === null ? t('Loading...') : t('No Ranked rooms open. Create one and invite your friends.')}
        columns={[
          {
            key: 'name',
            header: t('Room'),
            cell: (r) => (
              <span className="lobby-room">
                {r.hasPassword && <LockIcon label={t('Password')} />}
                {r.name}
                {isFull(r) && <Badge tone="warning">{t('Full')}</Badge>}
              </span>
            ),
          },
          { key: 'format', header: t('Format'), cell: (r) => r.format },
          { key: 'series', header: t('Series'), cell: (r) => t(seriesLabel(r.bestOf)) },
          { key: 'players', header: t('Players'), cell: (r) => `${r.players}/${r.maxPlayers}`, align: 'end' },
          { key: 'phase', header: t('Phase'), cell: (r) => <Badge tone={r.phase === 'lobby' ? 'success' : 'neutral'}>{t(phaseLabel(r.phase))}</Badge> },
          { key: 'ping', header: t('Ping'), cell: (r) => (r.region && pings.has(r.region) ? `${pings.get(r.region)} ms` : '—'), align: 'end' },
        ]}
      />
    </div>
  );
}

/** Criar sala Ranked (RN-RKL-06): formato, série e senha opcional; as regras são as do Ranked. */
export function CreateRankedRoomScreen() {
  const { t } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState(() => (user ? user.username : ''));
  const [format, setFormat] = useState<RankedFormat>('3x3');
  const [bestOf, setBestOf] = useState<SeriesBestOf>(1);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (user === null) return <Navigate to="/login" replace />;

  const create = () => {
    if (!name.trim()) return;
    setError(null);
    api<{ room: RoomSummary }>('/rooms/ranked', { body: { name: name.trim(), format, bestOf, ...(password ? { password } : {}) } }).then(
      ({ room }) => void navigate(`/play?sala=${encodeURIComponent(room.id)}`, password ? { state: { password } } : undefined),
      (e: unknown) => setError(t(e instanceof ApiError && e.code === 'rate_limited' ? 'Too many rooms. Try again later.' : 'Could not create the room.')),
    );
  };
  return (
    <Page title={t('Create Ranked room')} onBack={() => void navigate('/rooms', { state: { mode: 'ranked' } })} width="narrow">
      <Form
        label={t('Create Ranked room')}
        onSubmit={create}
        actions={
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            {t('Create and enter the lobby')}
          </Button>
        }
      >
        <TextField label={t('Room name')} value={name} onChange={setName} maxLength={40} autoFocus />
        <ChoiceField label={t('Format')} value={format} onChange={setFormat} options={RANKED_FORMATS.map((f) => ({ value: f, label: f }))} hint={t('$1 players per team.', format[0]!)} />
        <ChoiceField
          label={t('Series')}
          value={String(bestOf) as `${SeriesBestOf}`}
          onChange={(v) => setBestOf(Number(v) as SeriesBestOf)}
          options={SERIES_LENGTHS.map((n) => ({ value: String(n) as `${SeriesBestOf}`, label: t(seriesLabel(n)) }))}
        />
        <TextField label={t('Password (optional)')} type="password" autoComplete="new-password" value={password} onChange={setPassword} maxLength={15} />
        <p className="ui-muted">{t('Ranked rules are fixed: the password only limits who can join.')}</p>
      </Form>
      {error && <FormMessageLine message={{ text: error, error: true }} />}
    </Page>
  );
}
