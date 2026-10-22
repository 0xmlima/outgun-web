// SPDX-License-Identifier: GPL-2.0-or-later
// Painel admin (OG-087): salas ao vivo com os jogadores (kick, ban, mute, mensagem), denúncias,
// clãs (OG-275), bans, auditoria e, para admin, presets Casual, rotações e papéis. Quem não é moderador nem admin
// vê só um aviso (a API recusa as rotas de qualquer jeito).
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAccount } from '../app/account.js';
import { api, API_URL, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { TextPage } from '../ui/TextPage.js';
import { decodeMapFile } from '@outgun/content';
import { RANKED_FORMATS, type RankedFormat } from '@outgun/settings';

type Tab = 'rooms' | 'feedback' | 'network' | 'reports' | 'clans' | 'bans' | 'audit' | 'presets' | 'maps' | 'rotations' | 'invites' | 'roles';

interface RosterEntry {
  uid: number;
  name: string;
  team: number;
  accountId?: string;
  bot: boolean;
  muted: number;
}
interface LiveRoom {
  id: string;
  name: string;
  mode: string;
  preset: string;
  map: string | null;
  players: number;
  maxPlayers: number;
  roster: RosterEntry[];
}
interface Report {
  id: number;
  roomId: string | null;
  map: string | null;
  reporter: string;
  target: string;
  reason: string;
  createdAt: string;
}
interface Ban {
  id: number;
  username: string | null;
  ip: string | null;
  device: string | null;
  roomId: string | null;
  reason: string;
  expiresAt: string | null;
}
interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  roomId: string | null;
  reason: string;
  createdAt: string;
}
interface PresetRow {
  id: string;
  mode: string;
  description: string;
  overrides: string;
  locked: boolean;
  source: 'code' | 'panel';
  version: number | null;
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : String(e));
const when = (iso: string) => new Date(iso).toLocaleString();

/** Carrega `path` e recarrega a cada `everyMs` (0 = só quando `reload` muda). */
function useLoad<T>(path: string, everyMs = 0): { data: T | undefined; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ data: T | undefined; error: string | null }>({ data: undefined, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<T>(path).then(
        (data) => alive && setState({ data, error: null }),
        (e: unknown) => alive && setState((s) => ({ data: s.data, error: errorText(e) })),
      );
    void load();
    const id = everyMs > 0 ? setInterval(() => void load(), everyMs) : undefined;
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path, everyMs, tick]);
  return { ...state, reload: useCallback(() => setTick((n) => n + 1), []) };
}

export default function AdminScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user } = useAccount();
  const [tab, setTab] = useState<Tab>('rooms');
  const isAdmin = user?.isAdmin ?? false;
  const allowed = isAdmin || (user?.isModerator ?? false);
  const tabs: [Tab, string][] = [
    ['rooms', t('Live rooms')],
    ['feedback', t('Feedback')],
    ['network', t('Network')],
    ['reports', t('Reports')],
    ['clans', t('Clans')],
    ['bans', t('Bans')],
    ['audit', t('Audit log')],
    ['presets', t('Presets')],
    ['maps', t('Maps')],
    ['rotations', t('Map rotations')],
    ...(isAdmin ? ([['invites', t('Invites')], ['roles', t('Roles')]] as [Tab, string][]) : []),
  ];
  return (
    <TextPage caption={t('Moderation')} onBack={() => void navigate('/')}>
      {user === undefined ? null : !allowed ? (
        <p className="stats-note error">{t('Moderators and admins only.')}</p>
      ) : (
        <div className="admin">
          <p className="stats-tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </p>
          {tab === 'rooms' && <RoomsTab isAdmin={isAdmin} />}
          {tab === 'feedback' && <FeedbackTab />}
          {tab === 'network' && <NetworkTab />}
          {tab === 'invites' && isAdmin && <InvitesTab />}
          {tab === 'reports' && <ReportsTab />}
          {tab === 'clans' && <ClansTab />}
          {tab === 'bans' && <BansTab isAdmin={isAdmin} />}
          {tab === 'audit' && <AuditTab />}
          {/* presets e rotações: moderador também edita (D-70) */}
          {tab === 'presets' && <PresetsTab canEdit={allowed} />}
          {tab === 'maps' && <MapsTab />}
          {tab === 'rotations' && <RotationsTab canEdit={allowed} />}
          {tab === 'roles' && isAdmin && <RolesTab />}
        </div>
      )}
    </TextPage>
  );
}

function Status({ text, error }: { text?: string | null | undefined; error?: string | null | undefined }): ReactNode {
  if (error) return <p className="stats-note error" role="alert">{error}</p>;
  return text ? <p className="stats-note" role="status">{text}</p> : null;
}

/** Manda um comando e acompanha até o game server confirmar (≤ ~6 s). */
async function sendCommand(roomId: string, body: Record<string, unknown>, t: (s: string, ...a: string[]) => string): Promise<string> {
  const { commandId } = await api<{ commandId: number }>(`/admin/rooms/${encodeURIComponent(roomId)}/commands`, { body });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const c = await api<{ status: string; result: { ok: boolean; text?: string } | null }>(`/admin/commands/${commandId}`);
    if (c.status === 'done') return c.result?.ok ? t('Done.') : t('Not done: $1', c.result?.text ?? '?');
  }
  return t('Sent; the game server has not confirmed yet.');
}

function RoomsTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = usePrefs();
  const rooms = useLoad<{ rooms: LiveRoom[] }>('/admin/rooms', 3000);
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [platform, setPlatform] = useState(false);
  const [message, setMessage] = useState('');
  const run = (roomId: string, body: Record<string, unknown>) => {
    setStatus({ text: t('Sending...') });
    sendCommand(roomId, body, t).then(
      (text) => {
        setStatus({ text });
        rooms.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  };
  const broadcast = (ev: FormEvent) => {
    ev.preventDefault();
    if (!message.trim()) return;
    api<{ rooms: number }>('/admin/broadcast', { body: { text: message.trim() } }).then(
      (r) => setStatus({ text: t('Message sent to $1 rooms.', String(r.rooms)) }),
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  };
  return (
    <section className="stats-section">
      <p className="admin-form">
        <label>
          {t('Reason')} <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </label>{' '}
        <label>
          {t('Ban minutes')} <input value={minutes} size={6} inputMode="numeric" onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
        </label>{' '}
        {isAdmin && (
          <label>
            <input type="checkbox" checked={platform} onChange={(e) => setPlatform(e.target.checked)} /> {t('Platform ban')}
          </label>
        )}
      </p>
      <Status text={status.text} error={status.error ?? rooms.error} />
      {rooms.data?.rooms.length === 0 && <p className="stats-note">{t('No rooms online.')}</p>}
      {rooms.data?.rooms.map((r) => (
        <div key={r.id} className="admin-room">
          <h2>
            {r.name} ({r.id}) · {r.mode} · {r.preset} · {r.map ?? '-'} · {r.players}/{r.maxPlayers}
          </h2>
          <table className="stats-table wide">
            <tbody>
              {r.roster.map((p) => (
                <tr key={p.uid} className={p.team === 0 ? 'team-red' : 'team-blue'}>
                  <td className="name">
                    {p.uid} {p.name}
                    {p.bot ? ' (bot)' : ''}
                    {p.muted ? ` (${t('muted')})` : ''}
                  </td>
                  <td>
                    {!p.bot && (
                      <>
                        <button type="button" onClick={() => run(r.id, { kind: 'kick', uid: p.uid, reason })}>
                          {t('Kick')}
                        </button>{' '}
                        <button type="button" onClick={() => run(r.id, { kind: 'ban', uid: p.uid, reason, minutes: Number(minutes) || 60, ...(platform ? { platform: true } : {}) })}>
                          {t('Ban')}
                        </button>{' '}
                        <button type="button" onClick={() => run(r.id, { kind: p.muted ? 'unmute' : 'mute', uid: p.uid })}>
                          {p.muted ? t('Unmute') : t('Mute')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="admin-form">
            <button type="button" disabled={!reason.trim()} onClick={() => run(r.id, { kind: 'message', text: reason.trim() })}>
              {t('Send the reason text as a message to this room')}
            </button>
          </p>
        </div>
      ))}
      {isAdmin && (
        <form className="admin-form" onSubmit={broadcast}>
          <label>
            {t('Message to all rooms')} <input value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} />
          </label>{' '}
          <button type="submit">{t('Send')}</button>
        </form>
      )}
    </section>
  );
}

function ReportsTab() {
  const { t } = usePrefs();
  const reports = useLoad<{ reports: Report[] }>('/admin/reports', 10_000);
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const close = (id: number, s: 'dismissed' | 'actioned') =>
    api(`/admin/reports/${id}`, { body: { status: s } }).then(
      () => {
        setStatus({ text: t('Done.') });
        reports.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  return (
    <section className="stats-section">
      <Status text={status.text} error={status.error ?? reports.error} />
      {reports.data?.reports.length === 0 && <p className="stats-note">{t('No open reports.')}</p>}
      {reports.data && reports.data.reports.length > 0 && (
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Date')}</th>
              <th>{t('Room')}</th>
              <th>{t('Reported player')}</th>
              <th>{t('Reason')}</th>
              <th>{t('By')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reports.data.reports.map((r) => (
              <tr key={r.id}>
                <td>{when(r.createdAt)}</td>
                <td className="name">
                  {r.roomId ?? '-'} {r.map ? `(${r.map})` : ''}
                </td>
                <td className="name">{r.target}</td>
                <td className="name">{r.reason}</td>
                <td className="name">{r.reporter}</td>
                <td>
                  <button type="button" onClick={() => void close(r.id, 'actioned')}>
                    {t('Handled')}
                  </button>{' '}
                  <button type="button" onClick={() => void close(r.id, 'dismissed')}>
                    {t('Dismiss')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface AdminClan {
  name: string;
  tag: string;
  description: string;
  createdAt: string;
  leader: string | null;
  members: number;
  reports: number;
}

/** Clãs (OG-275): denunciados primeiro; forçar troca de nome/tag/descrição ou dissolver, com motivo. */
function ClansTab() {
  const { t } = usePrefs();
  const [busca, setBusca] = useState('');
  const list = useLoad<{ clans: AdminClan[] }>(`/admin/clans?${new URLSearchParams({ busca })}`);
  const [edit, setEdit] = useState<{ tag: string; name: string; newTag: string; description: string; reason: string; dissolving: boolean } | null>(null);
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const done = () => {
    setStatus({ text: t('Done.') });
    setEdit(null);
    list.reload();
  };
  const save = (ev: FormEvent) => {
    ev.preventDefault();
    if (!edit) return;
    api(`/admin/clans/${encodeURIComponent(edit.tag)}`, { method: 'PATCH', body: { name: edit.name, tag: edit.newTag, description: edit.description, reason: edit.reason } }).then(done, (e: unknown) =>
      setStatus({ error: errorText(e) }),
    );
  };
  const dissolve = () => {
    if (!edit) return;
    api(`/admin/clans/${encodeURIComponent(edit.tag)}`, { method: 'DELETE', body: { reason: edit.reason } }).then(done, (e: unknown) => setStatus({ error: errorText(e) }));
  };
  return (
    <section className="stats-section">
      <form className="admin-form" onSubmit={(ev) => ev.preventDefault()}>
        <label>
          {t('Search by clan name or tag')} <input value={busca} maxLength={32} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </form>
      <Status text={status.text} error={status.error ?? list.error} />
      {list.data?.clans.length === 0 && <p className="stats-note">{t('No clans yet.')}</p>}
      {list.data && list.data.clans.length > 0 && (
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Clan')}</th>
              <th>{t('Leader')}</th>
              <th>{t('Members')}</th>
              <th>{t('Reports')}</th>
              <th>{t('Description')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.clans.map((c) => (
              <tr key={c.tag}>
                <td className="name">
                  <Link to={`/clans/${encodeURIComponent(c.tag)}`}>
                    ({c.tag}) {c.name}
                  </Link>
                </td>
                <td className="name">{c.leader ?? '-'}</td>
                <td>{c.members}</td>
                <td>{c.reports}</td>
                <td className="name">{c.description}</td>
                <td>
                  <button type="button" onClick={() => setEdit({ tag: c.tag, name: c.name, newTag: c.tag, description: c.description, reason: '', dissolving: false })}>
                    {t('Moderate')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit && (
        <form className="admin-form" onSubmit={save}>
          <label>
            {t('Clan name')} <input value={edit.name} maxLength={24} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>{' '}
          <label>
            {t('Tag')} <input value={edit.newTag} maxLength={2} size={3} onChange={(e) => setEdit({ ...edit, newTag: e.target.value })} />
          </label>{' '}
          <label>
            {t('Description')} <input value={edit.description} maxLength={500} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </label>{' '}
          <label>
            {t('Reason')} <input value={edit.reason} maxLength={200} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />
          </label>{' '}
          <button type="submit" disabled={!edit.reason.trim()}>
            {t('Force change')}
          </button>{' '}
          {edit.dissolving ? (
            <>
              <button type="button" disabled={!edit.reason.trim()} onClick={dissolve}>
                {t('Confirm dissolution of $1', `(${edit.tag})`)}
              </button>{' '}
              <button type="button" onClick={() => setEdit({ ...edit, dissolving: false })}>
                {t('No')}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setEdit({ ...edit, dissolving: true })}>
              {t('Dissolve clan')}
            </button>
          )}{' '}
          <button type="button" onClick={() => setEdit(null)}>
            {t('Close')}
          </button>
        </form>
      )}
    </section>
  );
}

function BansTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = usePrefs();
  const list = useLoad<{ bans: Ban[] }>('/admin/bans');
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const [form, setForm] = useState({ username: '', ip: '', minutes: '', reason: '' });
  const revoke = (id: number) =>
    api(`/admin/bans/${id}`, { method: 'DELETE' }).then(
      () => {
        setStatus({ text: t('Ban revoked.') });
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  const create = (ev: FormEvent) => {
    ev.preventDefault();
    const body = { reason: form.reason, ...(form.username ? { username: form.username } : {}), ...(form.ip ? { ip: form.ip } : {}), ...(form.minutes ? { minutes: Number(form.minutes) } : {}) };
    api('/admin/bans', { body }).then(
      () => {
        setStatus({ text: t('Ban created.') });
        setForm({ username: '', ip: '', minutes: '', reason: '' });
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  };
  return (
    <section className="stats-section">
      <Status text={status.text} error={status.error ?? list.error} />
      {isAdmin && (
        <form className="admin-form" onSubmit={create}>
          <label>
            {t('Account')} <input value={form.username} maxLength={32} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>{' '}
          <label>
            IP <input value={form.ip} maxLength={45} onChange={(e) => setForm({ ...form, ip: e.target.value })} />
          </label>{' '}
          <label>
            {t('Minutes (empty = no end)')} <input value={form.minutes} size={7} inputMode="numeric" onChange={(e) => setForm({ ...form, minutes: e.target.value.replace(/\D/g, '') })} />
          </label>{' '}
          <label>
            {t('Reason')} <input value={form.reason} maxLength={200} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>{' '}
          <button type="submit">{t('Platform ban')}</button>
        </form>
      )}
      {list.data?.bans.length === 0 && <p className="stats-note">{t('No active bans.')}</p>}
      {list.data && list.data.bans.length > 0 && (
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Account')}</th>
              <th>IP</th>
              <th>{t('Device')}</th>
              <th>{t('Room')}</th>
              <th>{t('Reason')}</th>
              <th>{t('Until')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.bans.map((b) => (
              <tr key={b.id}>
                <td className="name">{b.username ?? '-'}</td>
                <td className="name">{b.ip ?? '-'}</td>
                <td className="name">{b.device ?? '-'}</td>
                <td className="name">{b.roomId ?? t('platform')}</td>
                <td className="name">{b.reason}</td>
                <td>{b.expiresAt ? when(b.expiresAt) : t('no end')}</td>
                <td>
                  {(b.roomId !== null || isAdmin) && (
                    <button type="button" onClick={() => void revoke(b.id)}>
                      {t('Revoke')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function AuditTab() {
  const { t } = usePrefs();
  const audit = useLoad<{ entries: AuditEntry[] }>('/admin/audit?limit=100', 10_000);
  return (
    <section className="stats-section">
      <Status error={audit.error} />
      {audit.data && (
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Date')}</th>
              <th>{t('By')}</th>
              <th>{t('Action')}</th>
              <th>{t('Target')}</th>
              <th>{t('Room')}</th>
              <th>{t('Reason')}</th>
            </tr>
          </thead>
          <tbody>
            {audit.data.entries.map((e) => (
              <tr key={e.id}>
                <td>{when(e.createdAt)}</td>
                <td className="name">{e.actor}</td>
                <td className="name">{e.action}</td>
                <td className="name">{e.target ?? '-'}</td>
                <td className="name">{e.roomId ?? '-'}</td>
                <td className="name">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function PresetsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = usePrefs();
  const list = useLoad<{ presets: PresetRow[] }>('/admin/presets');
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const [form, setForm] = useState({ id: '', description: '', overrides: '' });
  const save = (ev: FormEvent) => {
    ev.preventDefault();
    api<{ version: number }>(`/admin/presets/${encodeURIComponent(form.id)}`, { method: 'PUT', body: { description: form.description, overrides: form.overrides } }).then(
      (r) => {
        setStatus({ text: t('Preset saved (version $1).', String(r.version)) });
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  };
  const remove = (id: string) =>
    api(`/admin/presets/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(
      () => {
        setStatus({ text: t('Preset removed.') });
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  return (
    <section className="stats-section">
      <p className="stats-line">{t('Built-in presets change only with a new release; the Ranked preset only by decision of the product owner.')}</p>
      <Status text={status.text} error={status.error ?? list.error} />
      {list.data && (
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Preset')}</th>
              <th>{t('Mode')}</th>
              <th>{t('Description')}</th>
              <th>{t('Settings')}</th>
              <th>{t('Version')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.presets.map((p) => (
              <tr key={p.id}>
                <td className="name">{p.id}</td>
                <td className="name">{p.mode}</td>
                <td className="name">{p.description}</td>
                <td className="name">
                  <code>{p.overrides || '-'}</code>
                </td>
                <td>{p.source === 'code' ? t('game') : p.version}</td>
                <td>
                  {canEdit && p.source === 'panel' && (
                    <>
                      <button type="button" onClick={() => setForm({ id: p.id, description: p.description, overrides: p.overrides })}>
                        {t('Edit')}
                      </button>{' '}
                      <button type="button" onClick={() => void remove(p.id)}>
                        {t('Remove')}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form className="admin-form" onSubmit={save}>
          <label>
            {t('Preset')} <input value={form.id} maxLength={32} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })} />
          </label>{' '}
          <label>
            {t('Description')} <input value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="admin-block">
            {t('Settings (gamemod lines)')}
            <textarea value={form.overrides} rows={5} onChange={(e) => setForm({ ...form, overrides: e.target.value })} />
          </label>
          <button type="submit" disabled={!form.id || !form.description}>
            {t('Save Casual preset')}
          </button>
        </form>
      )}
    </section>
  );
}

interface PanelMapRow {
  name: string;
  title: string;
  author: string;
  width: number;
  height: number;
  crc: number;
  version: number;
  active: boolean;
  updatedBy: string | null;
}

/**
 * Texto de um .txt de mapa: UTF-8 se for válido, senão Latin-1 (o "ANSI" dos arquivos da comunidade);
 * a API guarda em Latin-1, como os mapas do jogo.
 */
export function mapFileText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return decodeMapFile(bytes); // byte a byte (o TextDecoder 'latin1' do navegador é o windows-1252)
  }
}

/** Mapas .txt da moderação (OG-366, D-70): conferir (erros do parser ou prévia), publicar e desativar. */
function MapsTab() {
  const { t } = usePrefs();
  const list = useLoad<{ maps: PanelMapRow[] }>('/admin/maps');
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const [form, setForm] = useState({ name: '', text: '' });
  const [check, setCheck] = useState<{ ok: boolean; errors: string[]; preview?: { title: string; author: string; width: number; height: number } | null } | null>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    setCheck(null);
    void file.arrayBuffer().then((buf) => setForm({ name: file.name.replace(/\.txt$/i, '').slice(0, 64), text: mapFileText(new Uint8Array(buf)) }));
  };
  const verify = () =>
    api<NonNullable<typeof check>>('/admin/maps/check', { body: form }).then(setCheck, (e: unknown) => setStatus({ error: errorText(e) }));
  const publish = () =>
    api<{ version: number }>(`/admin/maps/${encodeURIComponent(form.name)}`, { method: 'PUT', body: { text: form.text } }).then(
      (r) => {
        setStatus({ text: t('Map published (version $1).', String(r.version)) });
        setCheck(null);
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  const remove = (name: string) =>
    api(`/admin/maps/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(
      () => {
        setStatus({ text: t('Map deactivated.') });
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  return (
    <section className="stats-section">
      <p className="stats-line">{t('Send a map .txt in the Outgun format. Once published it can go into the rotations and private rooms, without a new release.')}</p>
      <Status text={status.text} error={status.error ?? list.error} />
      {list.data && (
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Map')}</th>
              <th>{t('Title')}</th>
              <th>{t('Author')}</th>
              <th>{t('Size')}</th>
              <th>{t('Version')}</th>
              <th>{t('By')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.maps.map((m) => (
              <tr key={m.name}>
                <td className="name">{m.name}</td>
                <td className="name">{m.title}</td>
                <td className="name">{m.author || '-'}</td>
                <td>
                  {m.width}×{m.height}
                </td>
                <td>{m.active ? m.version : t('inactive')}</td>
                <td className="name">{m.updatedBy ?? '-'}</td>
                <td>
                  {m.active && (
                    <button type="button" onClick={() => void remove(m.name)}>
                      {t('Deactivate')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        className="admin-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          void verify();
        }}
      >
        <label>
          {t('Map file (.txt)')} <input type="file" accept=".txt,text/plain" onChange={(e) => pick(e.target.files?.[0])} />
        </label>{' '}
        <label>
          {t('Map')}{' '}
          <input
            value={form.name}
            maxLength={64}
            onChange={(e) => {
              setCheck(null);
              setForm({ ...form, name: e.target.value });
            }}
          />
        </label>{' '}
        <button type="submit" disabled={!form.name || !form.text}>
          {t('Check')}
        </button>
        {check && !check.ok && (
          <ul className="stats-note error" role="alert">
            {check.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {check?.ok && check.preview && (
          <p className="stats-note" role="status">
            {t('$1 by $2, $3×$4 rooms.', check.preview.title, check.preview.author || '-', String(check.preview.width), String(check.preview.height))}{' '}
            <button type="button" onClick={() => void publish()}>
              {t('Publish map')}
            </button>
          </p>
        )}
      </form>
    </section>
  );
}

interface RotationRow {
  key: string;
  maps: string[];
  version: number;
}

function RotationsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = usePrefs();
  const list = useLoad<{ rotations: RotationRow[]; catalog: string[] }>('/admin/rotations');
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const [casualDraft, setCasualDraft] = useState<string | undefined>();
  const [formatDrafts, setFormatDrafts] = useState<Partial<Record<RankedFormat, string[]>>>({});
  const saved = (key: string) => list.data?.rotations.find((r) => r.key === key)?.maps;
  const casual = casualDraft ?? saved('casual')?.join('\n') ?? '';
  // sem rotação do formato no painel, vale a `ranked` (a do servidor, se também faltar)
  const formatMaps = (f: RankedFormat) => formatDrafts[f] ?? saved(`ranked:${f}`) ?? saved('ranked') ?? [];
  const rows = [...new Set([...(list.data?.catalog ?? []), ...RANKED_FORMATS.flatMap(formatMaps)])];
  const toggle = (f: RankedFormat, map: string) => {
    const maps = formatMaps(f);
    setFormatDrafts({ ...formatDrafts, [f]: maps.includes(map) ? maps.filter((m) => m !== map) : [...maps, map] });
  };
  const put = (key: string, maps: string[]) => api<{ version: number }>(`/admin/rotations/${key}`, { method: 'PUT', body: { maps } });
  const done = (p: Promise<unknown>, after: () => void) =>
    p.then(
      () => {
        after();
        setStatus({ text: t('Rotation saved. It applies from the next map change.') });
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  const saveCasual = () => done(put('casual', casual.split('\n').map((m) => m.trim()).filter(Boolean)), () => setCasualDraft(undefined));
  const changed = RANKED_FORMATS.filter((f) => formatDrafts[f]);
  const saveFormats = () => done(Promise.all(changed.map((f) => put(`ranked:${f}`, formatMaps(f)))), () => setFormatDrafts({}));
  return (
    <section className="stats-section">
      <Status text={status.text} error={status.error ?? list.error} />
      <div className="admin-form">
        <label className="admin-block">
          {t('Casual rotation (one map per line; empty = server default)')}
          <textarea value={casual} rows={6} readOnly={!canEdit} onChange={(e) => setCasualDraft(e.target.value)} />
        </label>
        {canEdit && (
          <button type="button" disabled={!casual.trim()} onClick={() => void saveCasual()}>
            {t('Save')}
          </button>
        )}
      </div>
      <h3>{t('Ranked rotation by format')}</h3>
      {list.data && list.data.catalog.length === 0 && <p>{t('No game server has reported its maps yet; only the maps already in the rotations are listed.')}</p>}
      <table className="stats-table wide">
        <thead>
          <tr>
            <th>{t('Map')}</th>
            {RANKED_FORMATS.map((f) => (
              <th key={f}>{f}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((map) => (
            <tr key={map}>
              <td>{map}</td>
              {RANKED_FORMATS.map((f) => (
                <td key={f}>
                  <input type="checkbox" aria-label={`${map} ${f}`} checked={formatMaps(f).includes(map)} disabled={!canEdit} onChange={() => toggle(f, map)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <p className="admin-form">
          <button type="button" disabled={changed.length === 0 || changed.some((f) => formatMaps(f).length === 0)} onClick={() => void saveFormats()}>
            {t('Save')}
          </button>{' '}
          {changed.some((f) => formatMaps(f).length === 0) && t('Every format needs at least one map.')}
        </p>
      )}
    </section>
  );
}

function RolesTab() {
  const { t } = usePrefs();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'player' | 'moderator' | 'admin'>('moderator');
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    api<{ username: string; role: string }>(`/admin/users/${encodeURIComponent(username)}/role`, { method: 'PUT', body: { role } }).then(
      (r) => setStatus({ text: t('$1 is now $2.', r.username, r.role) }),
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  };
  return (
    <section className="stats-section">
      <form className="admin-form" onSubmit={submit}>
        <label>
          {t('Account')} <input value={username} maxLength={32} onChange={(e) => setUsername(e.target.value)} />
        </label>{' '}
        <label>
          {t('Role')}{' '}
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="player">{t('player')}</option>
            <option value="moderator">{t('moderator')}</option>
            <option value="admin">{t('admin')}</option>
          </select>
        </label>{' '}
        <button type="submit" disabled={!username.trim()}>
          {t('Change role')}
        </button>
      </form>
      <Status text={status.text} error={status.error} />
    </section>
  );
}

interface FeedbackRow {
  id: number;
  username: string;
  kind: string;
  fidelity: number | null;
  overall: number | null;
  veteran: boolean;
  text: string;
  context: Record<string, string | number>;
  status: string;
  note: string;
  createdAt: string;
}
interface Summary {
  people: number;
  average: number | null;
  distribution: number[];
}

const STATUSES = ['new', 'confirmed', 'critical', 'resolved', 'dismissed'] as const;

/** Feedback do beta (OG-106): resumo da fidelidade (critério do lançamento), filtros e triagem. */
function FeedbackTab() {
  const { t } = usePrefs();
  const [status, setStatus] = useState('');
  const query = status ? `?status=${status}` : '';
  const list = useLoad<{ summary: { all: Summary; veterans: Summary; openCritical: number }; feedback: FeedbackRow[] }>(`/admin/feedback${query}`, 15_000);
  const [msg, setMsg] = useState<{ text?: string; error?: string }>({});
  const triage = (id: number, next: string) =>
    api(`/admin/feedback/${id}`, { body: { status: next } }).then(
      () => {
        setMsg({ text: t('Done.') });
        list.reload();
      },
      (e: unknown) => setMsg({ error: errorText(e) }),
    );
  const label: Record<string, string> = { new: t('new'), confirmed: t('confirmed'), critical: t('critical'), resolved: t('resolved'), dismissed: t('dismissed') };
  const line = (title: string, x: Summary) => `${title}: ${x.people} · ${t('average')} ${x.average ?? '-'} · ${x.distribution.map((n, i) => `${i + 1}★ ${n}`).join('  ')}`;
  const sum = list.data?.summary;
  return (
    <section className="stats-section">
      {sum && (
        <>
          <p className="stats-line">{line(t('Fidelity, veterans (goal: 20 with average 4+)'), sum.veterans)}</p>
          <p className="stats-line">{line(t('Fidelity, everyone'), sum.all)}</p>
          <p className="stats-line">{t('Open critical bugs: $1', String(sum.openCritical))}</p>
        </>
      )}
      <p className="stats-tabs">
        {['', ...STATUSES].map((s) => (
          <button key={s} type="button" className={s === status ? 'active' : ''} onClick={() => setStatus(s)}>
            {s ? label[s] : t('All')}
          </button>
        ))}{' '}
        <a href={`${API_URL}/admin/feedback.csv${query}`}>{t('Download CSV')}</a>
      </p>
      <Status text={msg.text} error={msg.error ?? list.error} />
      {list.data && (
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Date')}</th>
              <th>{t('Player')}</th>
              <th>{t('Type')}</th>
              <th>{t('Fidelity')}</th>
              <th>{t('Overall')}</th>
              <th>{t('Text')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.feedback.map((f) => (
              <tr key={f.id}>
                <td>{when(f.createdAt)}</td>
                <td className="name">
                  {f.username}
                  {f.veteran ? ' (v)' : ''}
                </td>
                <td className="name">{f.kind}</td>
                <td>{f.fidelity ?? '-'}</td>
                <td>{f.overall ?? '-'}</td>
                <td className="name" title={Object.entries(f.context).map(([k, v]) => `${k}: ${v}`).join('\n')}>
                  {f.text}
                </td>
                <td>
                  <select value={f.status} onChange={(e) => void triage(f.id, e.target.value)} aria-label={t('Status')}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {label[s]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface Invite {
  code: string;
  note: string;
  uses: number;
  maxUses: number;
  usedBy: string[];
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
}

/** Convites do beta (OG-106): gerar, copiar o link e revogar. */
function InvitesTab() {
  const { t } = usePrefs();
  const list = useLoad<{ beta: boolean; invites: Invite[] }>('/admin/invites');
  const [form, setForm] = useState({ count: '5', maxUses: '1', note: '', expiresDays: '' });
  const [msg, setMsg] = useState<{ text?: string; error?: string }>({});
  const link = (code: string) => `${location.origin}/register?invite=${code}`;
  const create = (ev: FormEvent) => {
    ev.preventDefault();
    const body = { count: Number(form.count) || 1, maxUses: Number(form.maxUses) || 1, ...(form.note ? { note: form.note } : {}), ...(form.expiresDays ? { expiresDays: Number(form.expiresDays) } : {}) };
    api<{ codes: string[] }>('/admin/invites', { body }).then(
      (r) => {
        setMsg({ text: t('$1 invites created.', String(r.codes.length)) });
        list.reload();
      },
      (e: unknown) => setMsg({ error: errorText(e) }),
    );
  };
  const revoke = (code: string) =>
    api(`/admin/invites/${code}`, { method: 'DELETE' }).then(
      () => list.reload(),
      (e: unknown) => setMsg({ error: errorText(e) }),
    );
  return (
    <section className="stats-section">
      {list.data && !list.data.beta && <p className="stats-note">{t('The server is not in closed beta (BETA=1): invites are not required to sign up.')}</p>}
      <form className="admin-form" onSubmit={create}>
        <label>
          {t('How many')} <input value={form.count} size={3} inputMode="numeric" onChange={(e) => setForm({ ...form, count: e.target.value.replace(/\D/g, '') })} />
        </label>{' '}
        <label>
          {t('Uses each')} <input value={form.maxUses} size={4} inputMode="numeric" onChange={(e) => setForm({ ...form, maxUses: e.target.value.replace(/\D/g, '') })} />
        </label>{' '}
        <label>
          {t('Days valid (empty = no end)')} <input value={form.expiresDays} size={4} inputMode="numeric" onChange={(e) => setForm({ ...form, expiresDays: e.target.value.replace(/\D/g, '') })} />
        </label>{' '}
        <label>
          {t('Note')} <input value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>{' '}
        <button type="submit">{t('Create invites')}</button>
      </form>
      <Status text={msg.text} error={msg.error ?? list.error} />
      {list.data && list.data.invites.length > 0 && (
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Invite link')}</th>
              <th>{t('Uses')}</th>
              <th>{t('Used by')}</th>
              <th>{t('Note')}</th>
              <th>{t('Until')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.invites.map((i) => (
              <tr key={i.code}>
                <td className="name">
                  <code>{i.revoked ? i.code : link(i.code)}</code>
                </td>
                <td>
                  {i.uses}/{i.maxUses}
                </td>
                <td className="name">{i.usedBy.join(', ') || '-'}</td>
                <td className="name">{i.note}</td>
                <td>{i.revoked ? t('revoked') : i.expiresAt ? when(i.expiresAt) : t('no end')}</td>
                <td>
                  {!i.revoked && i.uses < i.maxUses && (
                    <>
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(link(i.code))}>
                        {t('Copy link')}
                      </button>{' '}
                      <button type="button" onClick={() => void revoke(i.code)}>
                        {t('Revoke')}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface RegionNet {
  region: string;
  reports: number;
  seconds: number;
  ping_p50: number | null;
  ping_p95: number | null;
  lag_p50: number;
  corrections_per_min: number;
  fps_p5: number;
  stall_pct: number;
}

/** Rede dos jogadores por região (telemetria anônima, OG-108): para ajustar rede e predição. */
function NetworkTab() {
  const { t } = usePrefs();
  const [days, setDays] = useState(7);
  const net = useLoad<{ regions: RegionNet[] }>(`/admin/network?days=${days}`, 30_000);
  return (
    <section className="stats-section">
      <p className="stats-tabs">
        {[1, 7, 30].map((d) => (
          <button key={d} type="button" className={d === days ? 'active' : ''} onClick={() => setDays(d)}>
            {t('$1 days', String(d))}
          </button>
        ))}
      </p>
      <Status error={net.error} />
      {net.data?.regions.length === 0 && <p className="stats-note">{t('No reports yet.')}</p>}
      {net.data && net.data.regions.length > 0 && (
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Region')}</th>
              <th>{t('Matches')}</th>
              <th>{t('Minutes')}</th>
              <th>{t('Ping p50 / p95 (ms)')}</th>
              <th>{t('Control delay p50 (ms)')}</th>
              <th>{t('Corrections/min')}</th>
              <th>{t('fps p5')}</th>
              <th>{t('Frame drops')}</th>
            </tr>
          </thead>
          <tbody>
            {net.data.regions.map((r) => (
              <tr key={r.region}>
                <td className="name">{r.region}</td>
                <td>{r.reports}</td>
                <td>{Math.round(r.seconds / 60)}</td>
                <td>
                  {r.ping_p50 ?? '-'} / {r.ping_p95 ?? '-'}
                </td>
                <td>{r.lag_p50}</td>
                <td>{r.corrections_per_min}</td>
                <td>{r.fps_p5}</td>
                <td>{r.stall_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
