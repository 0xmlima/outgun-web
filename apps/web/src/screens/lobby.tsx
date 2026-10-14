// SPDX-License-Identifier: GPL-2.0-or-later
// Lobby de salas (OG-069; `Menu_serverList` do original com o master server trocado pela API):
// modo Casual/Ranked, lista atualizada a cada 3 s com jogadores, mapa e ping da região, "Jogar
// agora" por modo, link de convite e criação de sala privada Casual.
import { PRESETS } from '@outgun/settings';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { loadManifest } from '../assets.js';
import { useAccount } from '../app/account.js';
import { deviceId } from '../app/device.js';
import { api, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { joinErrorText } from '../game/net/ticket.js';
import { BitmapText } from '../ui/BitmapText.js';
import { Menu, type MenuItem } from '../ui/Menu.js';

type Mode = 'casual' | 'ranked';

export interface RoomSummary {
  id: string;
  name: string;
  mode: Mode;
  preset: string;
  hasPassword: boolean;
  maxPlayers: number;
  players: number;
  map: string | null;
  online: boolean;
  persistent: boolean;
  region: string | null;
  /** Espectador ao vivo (OG-092); null para sala com senha ou fora do ar. */
  spectateUrl?: string | null;
}

/** Intervalo da atualização da lista (critério: ≤ 5 s). */
export const REFRESH_MS = 3000;
const MODES: readonly Mode[] = ['casual', 'ranked'];
const CASUAL_PRESETS = PRESETS.filter((p) => p.mode === 'casual').map((p) => p.id);

/** Ordem da lista: com gente primeiro (mais cheia antes), depois por nome; lotadas no fim. */
export function sortRooms(rooms: readonly RoomSummary[]): RoomSummary[] {
  const full = (r: RoomSummary) => (r.online && r.players >= r.maxPlayers ? 1 : 0);
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

export function LobbyScreen() {
  const { t, prefs, setPrefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const pings = usePings();
  const [mode, setMode] = useState<Mode>('casual');
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = prefs.playerName.trim() || 'Convidado';

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ rooms: RoomSummary[] }>(`/rooms?mode=${mode}`).then(
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
    if (room.mode === 'ranked' && !user) return void navigate('/login');
    if (room.hasPassword) return void navigate(`/rooms/${room.id}`);
    void navigate(`/play?sala=${encodeURIComponent(room.id)}`);
  };

  const items: MenuItem[] = [
    { kind: 'choice', label: t('Mode'), value: mode === 'ranked' ? t('Ranked') : t('Casual'), onChange: (d) => setMode(MODES[(MODES.indexOf(mode) + d + 2) % 2]!) },
    user
      ? { kind: 'choice', label: t('Name'), value: user.username, onChange: () => {}, disabled: true }
      : { kind: 'text', label: t('Name'), value: prefs.playerName, onChange: (v) => setPrefs({ playerName: v }), maxLength: 15 },
    {
      kind: 'action',
      label: t('Play now'),
      onActivate: () => {
        if (mode === 'ranked' && !user) return void navigate('/login');
        void quickJoin(mode, name, bestRegion(pings)).then((id) => void navigate(`/play?sala=${encodeURIComponent(id)}`), fail);
      },
    },
    mode === 'casual'
      ? { kind: 'action', label: t('Create private room'), onActivate: () => void navigate(user ? '/rooms/new' : '/login'), ...(user ? {} : { note: t('needs an account') }) }
      : { kind: 'action', label: t('Create private room'), onActivate: () => {}, disabled: true, note: t('Casual only') },
    ...(rooms ?? []).map(
      (r): MenuItem => ({
        kind: 'action',
        label: `${r.hasPassword ? '* ' : ''}${r.name}`,
        note: [
          `${r.players}/${r.maxPlayers}`,
          r.map ?? '-',
          r.region && pings.has(r.region) ? `${pings.get(r.region)} ms` : '',
        ]
          .filter(Boolean)
          .join('  '),
        disabled: r.online && r.players >= r.maxPlayers,
        onActivate: () => enter(r),
      }),
    ),
  ];
  return (
    <Menu caption={t('Rooms')} items={items} onBack={() => void navigate('/')}>
      <p className="menu-help">
        <BitmapText
          text={
            error ??
            (mode === 'ranked'
              ? t('Ranked: no power-ups, account required, counts for the ranking.')
              : t('Casual: power-ups on, guests welcome, does not count for the ranking.'))
          }
        />
      </p>
      {rooms !== null && rooms.length === 0 && !error && (
        <p className="menu-help">
          <BitmapText text={t('No rooms open. "Play now" opens one.')} />
        </p>
      )}
    </Menu>
  );
}

/** Página do link de convite: mostra a sala e pede a senha, se houver. */
export function JoinRoomScreen() {
  const { t, prefs, setPrefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [room, setRoom] = useState<RoomSummary | null | undefined>(undefined);
  const [password, setPassword] = useState('');
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
  const items: MenuItem[] = [
    { kind: 'choice', label: t('Mode'), value: room.mode === 'ranked' ? t('Ranked') : t('Casual'), onChange: () => {}, disabled: true },
    { kind: 'choice', label: t('Players'), value: `${room.players}/${room.maxPlayers}`, onChange: () => {}, disabled: true },
    user
      ? { kind: 'choice', label: t('Name'), value: user.username, onChange: () => {}, disabled: true }
      : { kind: 'text', label: t('Name'), value: prefs.playerName, onChange: (v) => setPrefs({ playerName: v }), maxLength: 15 },
    ...(room.hasPassword ? [{ kind: 'text', label: t('Password'), value: password, onChange: setPassword, password: true, maxLength: 15, onEnter: play } as MenuItem] : []),
    { kind: 'action', label: t('Join'), onActivate: play },
    ...(room.spectateUrl ? [{ kind: 'action', label: t('Watch live'), onActivate: () => void navigate(`/spectate?src=${encodeURIComponent(room.spectateUrl!)}`) } as MenuItem] : []),
    { kind: 'action', label: t('Copy invite link'), onActivate: () => void navigator.clipboard?.writeText(`${location.origin}/rooms/${room.id}`) },
  ];
  return <Menu caption={room.name} items={items} onBack={() => void navigate('/rooms')} />;
}

/** Sala privada Casual (RN-CFG-03): preset, senha, vagas e rotação própria. */
export function CreateRoomScreen() {
  const { t } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState(() => (user ? `${user.username}` : ''));
  const [preset, setPreset] = useState('classic');
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [maps, setMaps] = useState<readonly string[]>([]);
  const [allMaps, setAllMaps] = useState<readonly string[]>([]);
  const [pickMaps, setPickMaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void loadManifest().then((m) => m && setAllMaps(Object.entries(m.maps).filter(([, v]) => v.dir === 'maps').map(([k]) => k)));
  }, []);
  const duel = preset === 'duel';
  const mapsLabel = useMemo(() => (maps.length === 0 ? t('Official rotation') : maps.length === 1 ? maps[0]! : t('$1 maps', String(maps.length))), [maps, t]);
  if (user === null) return <Navigate to="/login" replace />;

  if (pickMaps) {
    const items: MenuItem[] = [
      { kind: 'action', label: t('Done'), onActivate: () => setPickMaps(false) },
      { kind: 'action', label: t('Official rotation'), note: maps.length === 0 ? '*' : '', onActivate: () => setMaps([]) },
      ...allMaps.map(
        (m): MenuItem => ({
          kind: 'action',
          label: m,
          note: maps.includes(m) ? '*' : '',
          onActivate: () => setMaps((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m])),
        }),
      ),
    ];
    return <Menu caption={t('Maps')} items={items} onBack={() => setPickMaps(false)} />;
  }

  const create = () => {
    setError(null);
    api<{ room: RoomSummary; inviteUrl: string }>('/rooms', {
      body: { name: name.trim(), preset, ...(password ? { password } : {}), ...(duel ? {} : { maxPlayers }), ...(maps.length ? { maps } : {}) },
    }).then(
      ({ room }) => void navigate(`/play?sala=${encodeURIComponent(room.id)}`, password ? { state: { password } } : undefined),
      (e: unknown) => setError(e instanceof ApiError && e.code === 'rate_limited' ? t('Too many rooms. Try again later.') : t('Could not create the room.')),
    );
  };
  const items: MenuItem[] = [
    { kind: 'text', label: t('Room name'), value: name, onChange: setName, maxLength: 40 },
    {
      kind: 'choice',
      label: t('Rules'),
      // nome curto do preset: o começo da descrição ("Clássico: ...")
      value: PRESETS.find((p) => p.id === preset)?.description.split(':')[0] ?? preset,
      onChange: (d) => setPreset(CASUAL_PRESETS[(CASUAL_PRESETS.indexOf(preset) + d + CASUAL_PRESETS.length) % CASUAL_PRESETS.length]!),
    },
    { kind: 'text', label: t('Password (optional)'), value: password, onChange: setPassword, password: true, maxLength: 15 },
    {
      kind: 'choice',
      label: t('Players'),
      value: duel ? '2' : String(maxPlayers),
      disabled: duel,
      onChange: (d) => setMaxPlayers((n) => Math.min(32, Math.max(2, n + 2 * d))),
    },
    { kind: 'action', label: t('Maps'), note: mapsLabel, onActivate: () => setPickMaps(true) },
    { kind: 'action', label: t('Create and play'), disabled: !name.trim(), onActivate: create },
  ];
  const description = PRESETS.find((p) => p.id === preset)?.description ?? '';
  return (
    <Menu caption={t('Create private room')} items={items} onBack={() => void navigate('/rooms')}>
      <p className="menu-help">
        <BitmapText text={error ?? description} />
      </p>
    </Menu>
  );
}
