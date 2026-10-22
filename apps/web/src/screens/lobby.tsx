// SPDX-License-Identifier: GPL-2.0-or-later
// Lobby de salas (OG-069; `Menu_serverList` do original com o master server trocado pela API):
// modo Casual/Ranked, lista atualizada a cada 3 s com jogadores, mapa e ping da região, "Jogar
// agora" por modo, link de convite e criação de sala privada Casual. Visual v2 (OG-203): abas por modo,
// filtros e tabela de salas; convite e criação de sala em formulários do design system. A aba Ranked é a
// lista de salas de lobby (OG-255, `ranked-rooms.tsx`): sem "Jogar agora" no Ranked.
import { PRESETS } from '@outgun/settings';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { loadManifest } from '../assets.js';
import { joinName, useAccount } from '../app/account.js';
import { deviceId } from '../app/device.js';
import { api, ApiError } from '../app/api.js';
import { BOT_LEVEL_CHOICES, usePrefs } from '../app/prefs.js';
import { joinErrorText } from '../game/net/ticket.js';
import { Badge, Button } from '../ui/Button.js';
import { ChoiceField, SliderField, TextField, ToggleField } from '../ui/Field.js';
import { Form, FormMessageLine, Page } from '../ui/Page.js';
import { Table } from '../ui/Table.js';
import { Tabs } from '../ui/Tabs.js';
import { RankedRoomsPanel, WatchButton } from './ranked-rooms.js';
import { MapPreview } from './MapPreview.js';

type Mode = 'casual' | 'ranked';

export interface RoomSummary {
  id: string;
  name: string;
  mode: Mode;
  preset: string;
  hasPassword: boolean;
  maxPlayers: number;
  players: number;
  /** Sem os bots (OG-282). */
  humans: number;
  map: string | null;
  online: boolean;
  persistent: boolean;
  region: string | null;
  /** Espectador ao vivo (OG-092); null para sala com senha ou fora do ar. */
  spectateUrl?: string | null;
}

/** Intervalo da atualização da lista (critério: ≤ 5 s). */
export const REFRESH_MS = 3000;
/** Presets Casual do código, até a lista da API chegar (ela traz também os do painel, OG-365). */
const CASUAL_PRESETS = PRESETS.filter((p) => p.mode === 'casual').map(({ id, description }) => ({ id, description }));

/** Filtros do lobby: busca por nome ou mapa e esconder as lotadas. */
export function filterRooms(rooms: readonly RoomSummary[], search: string, hideFull: boolean): RoomSummary[] {
  const q = search.trim().toLowerCase();
  return rooms.filter(
    (r) => (!hideFull || !isFull(r)) && (!q || r.name.toLowerCase().includes(q) || (r.map ?? '').toLowerCase().includes(q)),
  );
}

const isFull = (r: RoomSummary) => r.online && r.players >= r.maxPlayers;

/** Ordem da lista: com gente primeiro (mais cheia antes), depois por nome; lotadas no fim. */
export function sortRooms(rooms: readonly RoomSummary[]): RoomSummary[] {
  const full = (r: RoomSummary) => (isFull(r) ? 1 : 0);
  return [...rooms].sort((a, b) => full(a) - full(b) || b.players - a.players || a.name.localeCompare(b.name));
}

/** Ping de cada região (ms), medido com `GET <pingUrl>` (o /health do game server). */
function usePings(): ReadonlyMap<string, number> {
  const [pings, setPings] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    let alive = true;
    const measure = async () => {
      try {
        const { regions } = await api<{ regions: { region: string; pingUrl: string }[] }>('/regions');
        const result = new Map<string, number>();
        for (const { region, pingUrl } of regions) {
          let best = Infinity;
          for (let i = 0; i < 3; i++) {
            const t0 = performance.now();
            try {
              await fetch(pingUrl, { cache: 'no-store' });
              best = Math.min(best, performance.now() - t0);
            } catch {
              // região fora do ar: fica sem ping
            }
          }
          if (best < Infinity) result.set(region, Math.round(best));
        }
        if (alive) setPings(result);
      } catch {
        // sem API: sem ping
      }
    };
    void measure();
    const id = setInterval(() => void measure(), 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return pings;
}

/** Região de menor ping (preferência ao abrir salas e no "Jogar agora"). */
function bestRegion(pings: ReadonlyMap<string, number>): string | undefined {
  return [...pings].sort((a, b) => a[1] - b[1])[0]?.[0];
}

/** "Jogar agora": a API escolhe a sala do modo; o jogo pede o próprio ticket ao entrar. */
export async function quickJoin(mode: Mode, name: string, region?: string): Promise<string> {
  const r = await api<{ roomId: string }>('/rooms/quick-join', { body: { mode, name, device: deviceId(), ...(region ? { region } : {}) } });
  return r.roomId;
}

/** Nome do jogador: o da conta, ou um campo para o convidado (vai para as preferências). */
function NameField() {
  const { t, prefs, setPrefs } = usePrefs();
  const { user } = useAccount();
  return user ? (
    <TextField label={t('Name')} value={user.username} onChange={() => {}} disabled />
  ) : (
    <TextField label={t('Name')} value={prefs.playerName} onChange={(v) => setPrefs({ playerName: v })} maxLength={15} />
  );
}

export function LobbyScreen() {
  const { t, prefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const pings = usePings();
  // "Ranked" abre a lista das salas de lobby (OG-255); a volta da criação de sala Ranked cai nela
  const location = useLocation();
  const [mode, setMode] = useState<Mode>(() => ((location.state as { mode?: Mode } | null)?.mode === 'ranked' ? 'ranked' : 'casual'));
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hideFull, setHideFull] = useState(false);
  const name = joinName(user, prefs.playerName);

  useEffect(() => {
    if (mode !== 'casual') return;
    let alive = true;
    const load = () =>
      api<{ rooms: RoomSummary[] }>(`/rooms?mode=casual`).then(
        (r) => {
          if (!alive) return;
          setRooms(sortRooms(r.rooms));
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
  }, [mode, t]);

  const fail = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'unknown';
    if (code === 'account_required' || code === 'beta_account_required') void navigate('/login');
    else setError(t(code === 'no_room' ? 'No room available right now.' : joinErrorText(code)));
  };
  const enter = (room: RoomSummary) => {
    if (isFull(room)) return;
    if (room.hasPassword) return void navigate(`/rooms/${room.id}`);
    void navigate(`/play?sala=${encodeURIComponent(room.id)}`);
  };
  const playNow = () => void quickJoin('casual', name, bestRegion(pings)).then((id) => void navigate(`/play?sala=${encodeURIComponent(id)}`), fail);
  const shown = filterRooms(rooms ?? [], search, hideFull);

  return (
    <Page title={t('Rooms')} onBack={() => void navigate('/')}>
      <Tabs
        label={t('Mode')}
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'casual', label: t('Casual') },
          { id: 'ranked', label: t('Ranked') },
        ]}
      >
        {mode === 'ranked' ? (
          <RankedRoomsPanel pings={pings} />
        ) : (
          <div className="ui-stack lobby">
            <p className="ui-muted">{t('Casual: power-ups on, guests welcome, does not count for the ranking.')}</p>
            <div className="lobby-actions">
              {!user && (
                <div className="lobby-name">
                  <NameField />
                </div>
              )}
              <Button variant="primary" size="lg" onClick={playNow}>
                {t('Play now')}
              </Button>
              <Button onClick={() => void navigate(user ? '/rooms/new' : '/login')}>
                {t('Create private room')}
                {!user && <Badge>{t('needs an account')}</Badge>}
              </Button>
            </div>
            {error && <FormMessageLine message={{ text: error, error: true }} />}
            <div className="lobby-filters">
              <TextField label={t('Search rooms')} type="search" value={search} onChange={setSearch} placeholder={t('Room or map')} maxLength={40} />
              <ToggleField label={t('Hide full rooms')} checked={hideFull} onChange={setHideFull} />
            </div>
            <Table
              caption={t('Rooms')}
              rows={shown}
              rowKey={(r) => r.id}
              onRowActivate={enter}
              empty={rooms === null ? t('Loading...') : t('No rooms open. "Play now" opens one.')}
              columns={[
                {
                  key: 'name',
                  header: t('Room'),
                  cell: (r) => (
                    <span className="lobby-room">
                      {r.name}
                      {r.hasPassword && <Badge>{t('Password')}</Badge>}
                      {isFull(r) && <Badge tone="warning">{t('Full')}</Badge>}
                    </span>
                  ),
                },
                { key: 'map', header: t('Map'), cell: (r) => r.map ?? '—' },
                { key: 'players', header: t('Players'), cell: (r) => `${r.players}/${r.maxPlayers}`, align: 'end' },
                { key: 'ping', header: t('Ping'), cell: (r) => (r.region && pings.has(r.region) ? `${pings.get(r.region)} ms` : '—'), align: 'end' },
                { key: 'watch', header: t('Watch'), cell: (r) => <WatchButton room={r} />, align: 'end' },
              ]}
            />
          </div>
        )}
      </Tabs>
    </Page>
  );
}

/** Página do link de convite: mostra a sala e pede a senha, se houver. */
export function JoinRoomScreen() {
  const { t } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [room, setRoom] = useState<RoomSummary | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    api<{ room: RoomSummary }>(`/rooms/${encodeURIComponent(id)}`).then(
      (r) => alive && setRoom(r.room),
      () => alive && setRoom(null),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  if (room === undefined) return null;
  if (room === null) return <Navigate to="/rooms" replace />;
  const play = () => {
    if (room.mode === 'ranked' && !user) return void navigate('/login');
    void navigate(`/play?sala=${encodeURIComponent(room.id)}`, room.hasPassword ? { state: { password } } : undefined);
  };
  const copy = () => void navigator.clipboard?.writeText(`${location.origin}/rooms/${room.id}`).then(() => setCopied(true));
  return (
    <Page
      title={room.name}
      subtitle={`${room.mode === 'ranked' ? t('Ranked') : t('Casual')} · ${t('Players')} ${room.players}/${room.maxPlayers}${room.map ? ` · ${room.map}` : ''}`}
      onBack={() => void navigate('/rooms')}
      width="narrow"
    >
      <Form
        label={t('Join')}
        onSubmit={play}
        actions={
          <>
            <Button type="submit" variant="primary">
              {t('Join')}
            </Button>
            {room.spectateUrl && <Button onClick={() => void navigate(`/spectate?src=${encodeURIComponent(room.spectateUrl!)}`)}>{t('Watch live')}</Button>}
            <Button variant="ghost" onClick={copy}>
              {copied ? t('Link copied') : t('Copy invite link')}
            </Button>
          </>
        }
      >
        <NameField />
        {room.hasPassword && <TextField label={t('Password')} type="password" value={password} onChange={setPassword} maxLength={15} autoFocus />}
      </Form>
    </Page>
  );
}

/** Sala privada Casual (RN-CFG-03): preset, senha, vagas e rotação própria. */
export function CreateRoomScreen() {
  const { t, prefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState(() => (user ? `${user.username}` : ''));
  const [preset, setPreset] = useState('classic');
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [maps, setMaps] = useState<readonly string[]>([]);
  // bots da sala (OG-289): começam com os das opções; desligado, valem os do preset
  const [customBots, setCustomBots] = useState(true);
  const [bots, setBots] = useState(prefs.casualBots);
  const [botLevel, setBotLevel] = useState(prefs.casualBotLevel);
  const [allMaps, setAllMaps] = useState<readonly string[]>([]);
  // miniaturas só com a lista aberta (cada uma lê o mapa)
  const [mapsOpen, setMapsOpen] = useState(false);
  const [presets, setPresets] = useState<readonly { id: string; description: string }[]>(CASUAL_PRESETS);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // presets do jogo e do painel (OG-365); mapas só da rotação Casual do painel, se houver (D-69)
    api<{ presets: { id: string; description: string }[] }>('/presets').then(
      (r) => setPresets(r.presets),
      () => {},
    );
    void Promise.all([api<{ maps: string[] | null }>('/rotation').catch(() => ({ maps: null })), loadManifest()]).then(([rotation, m]) =>
      setAllMaps(rotation.maps ?? (m ? Object.entries(m.maps).filter(([, v]) => v.dir === 'maps').map(([k]) => k) : [])),
    );
  }, []);
  const duel = preset === 'duel';
  const slots = duel ? 2 : maxPlayers;
  const mapsLabel = useMemo(() => (maps.length === 0 ? t('Official rotation') : maps.length === 1 ? maps[0]! : t('$1 maps', String(maps.length))), [maps, t]);
  if (user === null) return <Navigate to="/login" replace />;

  const create = () => {
    if (!name.trim()) return;
    setError(null);
    api<{ room: RoomSummary; inviteUrl: string }>('/rooms', {
      body: { name: name.trim(), preset, ...(password ? { password } : {}), ...(duel ? {} : { maxPlayers }), ...(maps.length ? { maps } : {}), ...(customBots ? { bots: { count: Math.min(bots, slots - 1), level: botLevel } } : {}) },
    }).then(
      ({ room }) => void navigate(`/play?sala=${encodeURIComponent(room.id)}`, password ? { state: { password } } : undefined),
      (e: unknown) => setError(e instanceof ApiError && e.code === 'rate_limited' ? t('Too many rooms. Try again later.') : t('Could not create the room.')),
    );
  };
  const toggleMap = (m: string) => setMaps((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]));
  return (
    <Page title={t('Create private room')} onBack={() => void navigate('/rooms')} width="narrow">
      <Form
        label={t('Create private room')}
        onSubmit={create}
        actions={
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            {t('Create and play')}
          </Button>
        }
      >
        <TextField label={t('Room name')} value={name} onChange={setName} maxLength={40} autoFocus />
        <ChoiceField
          label={t('Rules')}
          value={preset}
          onChange={setPreset}
          // nome curto do preset: o começo da descrição ("Clássico: ...")
          options={presets.map((p) => ({ value: p.id, label: p.description.split(':')[0] || p.id }))}
          hint={presets.find((p) => p.id === preset)?.description}
        />
        <TextField label={t('Password (optional)')} type="password" autoComplete="new-password" value={password} onChange={setPassword} maxLength={15} />
        <SliderField label={t('Players')} value={duel ? 2 : maxPlayers} min={2} max={32} step={2} disabled={duel} onChange={setMaxPlayers} />
        <ToggleField label={t('Choose the bots')} checked={customBots} onChange={setCustomBots} hint={customBots ? undefined : t('The rules decide the bots.')} />
        <SliderField label={t('Number of bots')} value={Math.min(bots, slots - 1)} min={0} max={slots - 1} disabled={!customBots} onChange={setBots} />
        <ChoiceField
          label={t('Bot level')}
          value={String(botLevel)}
          disabled={!customBots}
          options={BOT_LEVEL_CHOICES.map(([value, text]) => ({ value: String(value), label: t(text) }))}
          onChange={(v) => setBotLevel(Number(v))}
        />
      </Form>
      <details className="lobby-maps" onToggle={(e) => setMapsOpen(e.currentTarget.open)}>
        <summary>
          {t('Maps')}: {mapsLabel}
        </summary>
        <div className="ui-row">
          <Button variant="ghost" onClick={() => setMaps([])} disabled={maps.length === 0}>
            {t('Official rotation')}
          </Button>
        </div>
        <ul>
          {allMaps.map((m) => (
            <li key={m}>
              <label>
                <input type="checkbox" checked={maps.includes(m)} onChange={() => toggleMap(m)} />
                {mapsOpen && <MapPreview name={m} label={m} thumb />}
                {m}
              </label>
            </li>
          ))}
        </ul>
      </details>
      {error && <FormMessageLine message={{ text: error, error: true }} />}
    </Page>
  );
}
