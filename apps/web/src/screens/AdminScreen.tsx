// SPDX-License-Identifier: GPL-2.0-or-later
// Painel admin (OG-087): salas ao vivo com os jogadores (kick, ban, mute, mensagem), denúncias,
// clãs (OG-275), bans, auditoria e, para admin, presets Casual, rotações e papéis. Quem não é moderador nem admin
// vê só um aviso (a API recusa as rotas de qualquer jeito).
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAccount } from '../app/account.js';
import { api, API_URL, ApiError } from '../app/api.js';
import { copyText } from '../app/clipboard.js';
import { isPhone, PHONE_ADMIN_TABS } from '../app/phone.js';
import { areaLabels, frequencyLabels, severityLabels, type BugReport } from '../app/bug-report.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { CupTab } from './admin-cup.js';
import { TextAreaField, TextField } from '../ui/Field.js';
import { Dialog } from '../ui/Dialog.js';
import { Page } from '../ui/Page.js';
import { Table } from '../ui/Table.js';
import { decodeMapFile, parseMapFile } from '@outgun/content';
import {
  casualPresetProblems,
  defaultFormValue,
  fieldProblem,
  formFromLines,
  linesFromForm,
  PRESET_FIELD_BY_NAME,
  PRESET_FIELDS,
  PRESET_FORM_CATEGORIES,
  RANKED_FORMATS,
  BOT_CHAT_EVENTS,
  BOT_CHAT_PER_MINUTE_MAX,
  BOT_CHAT_SPEAKERS,
  BOT_NAMES_MAX,
  type BotChatConfig,
  type BotChatEvent,
  type BotChatSpeaker,
  BOT_PREFIX_MAX_LENGTH,
  BOT_PREFIXES_MAX,
  type BotNameEntry,
  type BotNamesConfig,
  type Category,
  type PresetField,
  type PresetForm,
  type RankedFormat,
} from '@outgun/settings';
import { MapDrawing, MapPreview } from './MapPreview.js';

type Tab = 'rooms' | 'feedback' | 'network' | 'reports' | 'clans' | 'bans' | 'audit' | 'presets' | 'maps' | 'rotations' | 'bots' | 'invites' | 'roles' | 'cup';

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
  const phone = isPhone();
  const isAdmin = user?.isAdmin ?? false;
  const allowed = isAdmin || (user?.isModerator ?? false);
  const tabs = (
    [
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
    ['bots', t('Bots')],
    ...(isAdmin ? ([['cup', 'OutCup'], ['invites', t('Invites')], ['roles', t('Roles')]] as [Tab, string][]) : []),
    ] as [Tab, string][]
  ).filter(([id]) => !phone || PHONE_ADMIN_TABS.has(id)); // celular (OG-427): só as abas de moderação
  return (
    <Page title={t('Moderation')} width="full" onBack={() => void navigate('/')}>
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
          {phone && <p className="admin-muted">{t('Maps, presets, rotations, bots, roles, invites and network: only on the computer.')}</p>}
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
          {tab === 'bots' && <BotsTab />}
          {tab === 'roles' && isAdmin && <RolesTab />}
          {tab === 'cup' && isAdmin && <CupTab />}
        </div>
      )}
    </Page>
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

/** Salas ao vivo (OG-087, OG-389): ferramentas na barra de cima e uma ficha por sala, lado a lado. */
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
  const broadcast = () => {
    if (!message.trim()) return;
    api<{ rooms: number }>('/admin/broadcast', { body: { text: message.trim() } }).then(
      (r) => setStatus({ text: t('Message sent to $1 rooms.', String(r.rooms)) }),
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  };
  const list = rooms.data?.rooms ?? [];
  const players = list.reduce((n, r) => n + r.roster.filter((p) => !p.bot).length, 0);
  return (
    <section className="admin-tab">
      <div className="admin-bar">
        <TextField label={t('Reason')} value={reason} maxLength={200} placeholder={t('Used in kicks, bans and room messages')} onChange={setReason} />
        <TextField label={t('Ban minutes')} value={minutes} maxLength={6} onChange={(v) => setMinutes(v.replace(/\D/g, ''))} />
        {isAdmin && (
          <label className="admin-inline-check">
            <input type="checkbox" checked={platform} onChange={(e) => setPlatform(e.target.checked)} /> {t('Platform ban')}
          </label>
        )}
        {isAdmin && (
          <span className="admin-bar-end">
            <TextField label={t('Message to all rooms')} value={message} maxLength={200} onChange={setMessage} onEnter={broadcast} />
            <Button disabled={!message.trim()} onClick={broadcast}>
              {t('Send')}
            </Button>
          </span>
        )}
      </div>
      <div className="admin-summary">
        <Badge tone="accent">{t('$1 rooms', String(list.length))}</Badge>
        <Badge>{t('$1 players', String(players))}</Badge>
        <Status text={status.text} error={status.error ?? rooms.error} />
      </div>
      {rooms.data && list.length === 0 && <p className="admin-empty">{t('No rooms online.')}</p>}
      <div className="admin-cards">
        {list.map((r) => (
          <article key={r.id} className="admin-card">
            <header className="admin-card-head">
              <h3>{r.name}</h3>
              <Badge tone={r.mode === 'ranked' ? 'accent' : 'neutral'}>{r.mode === 'ranked' ? t('Ranked') : t('Casual')}</Badge>
              <span className="admin-muted">
                {r.preset} · {r.map ?? '—'} · {r.players}/{r.maxPlayers}
              </span>
            </header>
            {r.roster.length === 0 ? (
              <p className="admin-muted">{t('Empty room.')}</p>
            ) : (
              <ul className="admin-roster">
                {r.roster.map((p) => (
                  <li key={p.uid} className={p.team === 0 ? 'red' : 'blue'}>
                    <span className="admin-roster-name">
                      {p.name}
                      {p.bot && <Badge>{t('bot')}</Badge>}
                      {p.muted ? <Badge tone="warning">{t('muted')}</Badge> : null}
                    </span>
                    {!p.bot && (
                      <span className="admin-roster-actions">
                        <Button variant="ghost" onClick={() => run(r.id, { kind: p.muted ? 'unmute' : 'mute', uid: p.uid })}>
                          {p.muted ? t('Unmute') : t('Mute')}
                        </Button>
                        <Button variant="ghost" onClick={() => run(r.id, { kind: 'kick', uid: p.uid, reason })}>
                          {t('Kick')}
                        </Button>
                        <Button variant="danger" onClick={() => run(r.id, { kind: 'ban', uid: p.uid, reason, minutes: Number(minutes) || 60, ...(platform ? { platform: true } : {}) })}>
                          {t('Ban')}
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <footer className="admin-card-foot">
              <span className="admin-muted">{r.id}</span>
              <Button variant="ghost" disabled={!reason.trim()} onClick={() => run(r.id, { kind: 'message', text: reason.trim() })}>
                {t('Send the reason as a message')}
              </Button>
            </footer>
          </article>
        ))}
      </div>
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
    <section className="admin-tab">
      <div className="admin-summary">
        <Badge tone={reports.data?.reports.length ? 'warning' : 'neutral'}>{t('$1 open reports', String(reports.data?.reports.length ?? 0))}</Badge>
        <Status text={status.text} error={status.error ?? reports.error} />
      </div>
      <Table
        phoneCards
        caption={t('Reports')}
        rows={reports.data?.reports ?? []}
        rowKey={(r) => String(r.id)}
        empty={t('No open reports.')}
        columns={[
          { key: 'date', header: t('Date'), cell: (r) => when(r.createdAt) },
          { key: 'target', header: t('Reported player'), cell: (r) => <strong>{r.target}</strong> },
          { key: 'reason', header: t('Reason'), cell: (r) => <span className="admin-wrap">{r.reason}</span> },
          { key: 'room', header: t('Room'), cell: (r) => `${r.roomId ?? '—'}${r.map ? ` (${r.map})` : ''}` },
          { key: 'by', header: t('By'), cell: (r) => r.reporter },
          {
            key: 'actions',
            header: '',
            align: 'end',
            cell: (r) => (
              <span className="admin-row-actions">
                <Button variant="primary" onClick={() => void close(r.id, 'actioned')}>
                  {t('Handled')}
                </Button>
                <Button variant="ghost" onClick={() => void close(r.id, 'dismissed')}>
                  {t('Dismiss')}
                </Button>
              </span>
            ),
          },
        ]}
      />
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
    <section className="admin-tab">
      <div className="admin-bar">
        <TextField label={t('Search by clan name or tag')} value={busca} maxLength={32} onChange={setBusca} />
        <span className="admin-summary">
          <Badge>{t('$1 clans', String(list.data?.clans.length ?? 0))}</Badge>
          <Status text={status.text} error={status.error ?? list.error} />
        </span>
      </div>
      {edit && (
        <form className="admin-panel" onSubmit={save}>
          <h3>{t('Moderate clan $1', `(${edit.tag})`)}</h3>
          <div className="admin-panel-fields">
            <TextField label={t('Clan name')} value={edit.name} maxLength={24} onChange={(v) => setEdit({ ...edit, name: v })} />
            <TextField label={t('Tag')} value={edit.newTag} maxLength={2} onChange={(v) => setEdit({ ...edit, newTag: v })} />
            <TextField label={t('Description')} value={edit.description} maxLength={500} onChange={(v) => setEdit({ ...edit, description: v })} />
            <TextField label={t('Reason')} value={edit.reason} maxLength={200} hint={t('Required; goes to the audit log.')} onChange={(v) => setEdit({ ...edit, reason: v })} />
          </div>
          <div className="admin-row-actions">
            <Button type="submit" variant="primary" disabled={!edit.reason.trim()}>
              {t('Force change')}
            </Button>
            {edit.dissolving ? (
              <>
                <Button variant="danger" disabled={!edit.reason.trim()} onClick={dissolve}>
                  {t('Confirm dissolution of $1', `(${edit.tag})`)}
                </Button>
                <Button variant="ghost" onClick={() => setEdit({ ...edit, dissolving: false })}>
                  {t('No')}
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => setEdit({ ...edit, dissolving: true })}>
                {t('Dissolve clan')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEdit(null)}>
              {t('Close')}
            </Button>
          </div>
        </form>
      )}
      <Table
        phoneCards
        caption={t('Clans')}
        rows={list.data?.clans ?? []}
        rowKey={(c) => c.tag}
        empty={t('No clans yet.')}
        columns={[
          {
            key: 'clan',
            header: t('Clan'),
            cell: (c) => (
              <Link to={`/clans/${encodeURIComponent(c.tag)}`}>
                ({c.tag}) {c.name}
              </Link>
            ),
          },
          { key: 'leader', header: t('Leader'), cell: (c) => c.leader ?? '—' },
          { key: 'members', header: t('Members'), cell: (c) => c.members, align: 'end' },
          { key: 'reports', header: t('Reports'), cell: (c) => (c.reports > 0 ? <Badge tone="warning">{String(c.reports)}</Badge> : '0'), align: 'end' },
          { key: 'description', header: t('Description'), cell: (c) => <span className="admin-wrap">{c.description}</span> },
          {
            key: 'actions',
            header: '',
            align: 'end',
            cell: (c) => (
              <Button variant="ghost" onClick={() => setEdit({ tag: c.tag, name: c.name, newTag: c.tag, description: c.description, reason: '', dissolving: false })}>
                {t('Moderate')}
              </Button>
            ),
          },
        ]}
      />
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
    <section className="admin-tab">
      {isAdmin && (
        <form className="admin-bar" onSubmit={create}>
          <TextField label={t('Account')} value={form.username} maxLength={32} onChange={(v) => setForm({ ...form, username: v })} />
          <TextField label="IP" value={form.ip} maxLength={45} onChange={(v) => setForm({ ...form, ip: v })} />
          <TextField label={t('Minutes (empty = no end)')} value={form.minutes} maxLength={7} onChange={(v) => setForm({ ...form, minutes: v.replace(/\D/g, '') })} />
          <TextField label={t('Reason')} value={form.reason} maxLength={200} onChange={(v) => setForm({ ...form, reason: v })} />
          <span className="admin-bar-end">
            <Button type="submit" variant="danger" disabled={!form.reason.trim() || (!form.username && !form.ip)}>
              {t('Platform ban')}
            </Button>
          </span>
        </form>
      )}
      <div className="admin-summary">
        <Badge>{t('$1 active bans', String(list.data?.bans.length ?? 0))}</Badge>
        <Status text={status.text} error={status.error ?? list.error} />
      </div>
      <Table
        phoneCards
        caption={t('Bans')}
        rows={list.data?.bans ?? []}
        rowKey={(b) => String(b.id)}
        empty={t('No active bans.')}
        columns={[
          { key: 'account', header: t('Account'), cell: (b) => <strong>{b.username ?? '—'}</strong> },
          { key: 'ip', header: 'IP', cell: (b) => b.ip ?? '—' },
          { key: 'device', header: t('Device'), cell: (b) => b.device ?? '—' },
          { key: 'scope', header: t('Room'), cell: (b) => (b.roomId ? b.roomId : <Badge tone="danger">{t('platform')}</Badge>) },
          { key: 'reason', header: t('Reason'), cell: (b) => <span className="admin-wrap">{b.reason}</span> },
          { key: 'until', header: t('Until'), cell: (b) => (b.expiresAt ? when(b.expiresAt) : t('no end')) },
          {
            key: 'actions',
            header: '',
            align: 'end',
            cell: (b) =>
              (b.roomId !== null || isAdmin) && (
                <Button variant="ghost" onClick={() => void revoke(b.id)}>
                  {t('Revoke')}
                </Button>
              ),
          },
        ]}
      />
    </section>
  );
}


function AuditTab() {
  const { t } = usePrefs();
  const audit = useLoad<{ entries: AuditEntry[] }>('/admin/audit?limit=100', 10_000);
  return (
    <section className="admin-tab">
      <div className="admin-summary">
        <span className="admin-muted">{t('The last 100 moderation actions; refreshes every 10 s.')}</span>
        <Status error={audit.error} />
      </div>
      <Table
        phoneCards
        caption={t('Audit log')}
        rows={audit.data?.entries ?? []}
        rowKey={(e) => String(e.id)}
        empty={t('No actions yet.')}
        columns={[
          { key: 'date', header: t('Date'), cell: (e) => when(e.createdAt) },
          { key: 'by', header: t('By'), cell: (e) => <strong>{e.actor}</strong> },
          { key: 'action', header: t('Action'), cell: (e) => <Badge tone={['ban', 'platform-ban', 'kick'].includes(e.action) ? 'danger' : 'neutral'}>{e.action}</Badge> },
          { key: 'target', header: t('Target'), cell: (e) => e.target ?? '—' },
          { key: 'room', header: t('Room'), cell: (e) => e.roomId ?? '—' },
          { key: 'reason', header: t('Reason'), cell: (e) => <span className="admin-wrap">{e.reason}</span> },
        ]}
      />
    </section>
  );
}


const CATEGORY_LABELS: Readonly<Partial<Record<Category, string>>> = {
  game: 'Game',
  health: 'Health, energy and shooting',
  powerups: 'Power-ups',
  physics: 'Physics',
  bots: 'Bots',
  general: 'Room',
};
const CHOICE_LABELS: Readonly<Record<string, string>> = { no: 'Off', balance: 'Balance', shuffle: 'Shuffle', normal: 'Normal', special: 'Special' };

/** Faixa aceita, à vista ao lado do campo (OG-382). */
function rangeText(f: PresetField, t: (text: string, ...args: string[]) => string): string {
  if (f.control === 'bool' || f.control === 'choice') return '';
  if (f.control === 'itemsOrPercent') return t('0 to 32 items, or a %');
  const big = (n: number | undefined) => n === undefined || Math.abs(n) >= 2147483647;
  const lo = big(f.min) ? undefined : String(f.min);
  const hi = big(f.max) ? undefined : String(f.max);
  const text = lo !== undefined && hi !== undefined ? t('$1 to $2', lo, hi) : lo !== undefined ? t('at least $1', lo) : hi !== undefined ? t('at most $1', hi) : '';
  return f.allow0 && text ? t('$1, or 0', text) : text;
}

/** Controle de uma regra pelo tipo: caixa, número (com faixa), porcentagem, itens ou %, lista. */
function FieldControl({ f, value, disabled, onChange }: { f: PresetField; value: string; disabled: boolean; onChange: (v: string) => void }) {
  const { t } = usePrefs();
  const label = t(f.label);
  if (f.control === 'bool') return <input type="checkbox" aria-label={label} checked={value === '1'} disabled={disabled} onChange={(e) => onChange(e.target.checked ? '1' : '0')} />;
  if (f.control === 'choice') {
    return (
      <select className="ui-input" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {f.options!.map((o) => (
          <option key={o} value={o}>
            {t(CHOICE_LABELS[o] ?? o)}
          </option>
        ))}
      </select>
    );
  }
  const percent = value.endsWith('%');
  const n = percent ? value.slice(0, -1) : value;
  const number = (min?: number, max?: number) => (
    <input
      type="number"
      className="ui-input"
      aria-label={label}
      value={n}
      disabled={disabled}
      step={f.integer ? 1 : 'any'}
      {...(min !== undefined && min > -2147483648 ? { min } : {})}
      {...(max !== undefined && max < 2147483647 ? { max } : {})}
      onChange={(e) => onChange(e.target.value + (percent ? '%' : ''))}
    />
  );
  if (f.control === 'percent') return <>{number(0)} %</>;
  if (f.control === 'itemsOrPercent') {
    return (
      <>
        {number(0, percent ? undefined : 32)}{' '}
        <select className="ui-input" aria-label={`${label}: ${t('unit')}`} value={percent ? '%' : 'n'} disabled={disabled} onChange={(e) => onChange(n + (e.target.value === '%' ? '%' : ''))}>
          <option value="n">{t('items')}</option>
          <option value="%">{t('% of rooms')}</option>
        </select>
      </>
    );
  }
  return number(f.min, f.max);
}

interface PresetDraft {
  id: string;
  description: string;
  form: PresetForm;
  /** Preset do painel já salvo (o nome não muda) ou novo. */
  saved: boolean;
  readOnly: boolean;
}

/**
 * Presets em formulário (OG-382): lista à esquerda (os do jogo só leitura, os do painel editáveis) e,
 * à direita, as regras por categoria com caixa "alterar", controle pelo tipo, padrão e faixa. O modo
 * texto continua, sincronizado; só as regras marcadas viram linhas do preset.
 */
function PresetsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = usePrefs();
  const list = useLoad<{ presets: PresetRow[] }>('/admin/presets');
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>(PRESET_FORM_CATEGORIES[0]!);
  const open = (p: PresetRow, copy = false) => {
    setText(null);
    setDraft({
      id: copy ? `${p.id}-2`.slice(0, 32) : p.id,
      description: p.description,
      form: formFromLines(p.overrides),
      saved: !copy && p.source === 'panel',
      readOnly: !canEdit || (!copy && p.source === 'code'),
    });
  };
  const create = () => {
    setText(null);
    setDraft({ id: '', description: '', form: { values: {}, other: [] }, saved: false, readOnly: false });
  };
  const lines = draft ? (text ?? linesFromForm(draft.form)) : '';
  const problems = useMemo(() => (draft && !draft.readOnly ? casualPresetProblems(lines) : []), [draft, lines]);
  const fieldErrors = draft ? Object.entries(draft.form.values).flatMap(([name, v]) => (fieldProblem(PRESET_FIELD_BY_NAME.get(name)!, v) ? [name] : [])) : [];
  const setValue = (name: string, value: string | undefined) => {
    if (!draft) return;
    const values = { ...draft.form.values };
    if (value === undefined) delete values[name];
    else values[name] = value;
    setDraft({ ...draft, form: { ...draft.form, values } });
  };
  const save = (ev: FormEvent) => {
    ev.preventDefault();
    if (!draft) return;
    api<{ version: number }>(`/admin/presets/${encodeURIComponent(draft.id)}`, { method: 'PUT', body: { description: draft.description, overrides: lines } }).then(
      (r) => {
        setStatus({ text: t('Preset saved (version $1).', String(r.version)) });
        setDraft({ ...draft, saved: true, form: formFromLines(lines) });
        setText(null);
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  };
  const remove = (id: string) =>
    api(`/admin/presets/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(
      () => {
        setStatus({ text: t('Preset removed.') });
        setDraft(null);
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  const presets = list.data?.presets ?? [];
  const panelPresets = presets.filter((p) => p.source === 'panel');
  const item = (p: PresetRow) => (
    <li key={p.id}>
      <button type="button" className={draft?.id === p.id && (draft.saved || draft.readOnly) ? 'admin-preset-item active' : 'admin-preset-item'} onClick={() => open(p)}>
        <strong>{p.id}</strong>
        <span>{p.description}</span>
      </button>
    </li>
  );
  const shown = (f: PresetField, v: string) => (f.control === 'bool' ? t(v === '1' ? 'On' : 'Off') : f.control === 'choice' ? t(CHOICE_LABELS[v] ?? v) : v);
  const changedIn = (c: Category) => (draft ? PRESET_FIELDS.filter((f) => f.def.category === c && f.def.name in draft.form.values).length : 0);
  const changedCount = draft ? Object.keys(draft.form.values).length : 0;
  const canSave = !!draft && !draft.readOnly && !!draft.id && !!draft.description && problems.length === 0 && fieldErrors.length === 0;
  return (
    <section className="admin-presets">
      <nav className="admin-preset-list" aria-label={t('Presets')}>
        {canEdit && (
          <Button variant="primary" block onClick={create}>
            {t('New preset')}
          </Button>
        )}
        <h3>{t('From the panel')}</h3>
        {panelPresets.length > 0 ? <ul>{panelPresets.map(item)}</ul> : <p className="admin-muted">{t('No presets created yet.')}</p>}
        <h3>{t('From the game (read only)')}</h3>
        <ul>{presets.filter((p) => p.source === 'code').map(item)}</ul>
        <p className="admin-muted">{t('Built-in presets change only with a new release; the Ranked preset only by decision of the product owner.')}</p>
      </nav>
      {!draft ? (
        <div className="admin-preset-empty">
          <Status text={status.text} error={status.error ?? list.error} />
          <p className="admin-muted">{t('Pick a preset on the left to see its rules, or create a new one.')}</p>
        </div>
      ) : (
        <form className="admin-preset-editor" onSubmit={save}>
          {/* cabeçalho fixo: nome, descrição e as ações sempre à vista */}
          <header className="admin-preset-head">
            <div className="admin-preset-meta">
              <TextField label={t('Name')} value={draft.id} maxLength={32} disabled={draft.saved || draft.readOnly} placeholder={t('e.g. festival')} onChange={(v) => setDraft({ ...draft, id: v.toLowerCase().replace(/\s+/g, '-') })} />
              <TextField label={t('Description')} value={draft.description} maxLength={200} disabled={draft.readOnly} placeholder={t('What changes, in one line (appears in "Create room")')} onChange={(v) => setDraft({ ...draft, description: v })} />
            </div>
            <div className="admin-preset-actions">
              {draft.readOnly && canEdit && <Button onClick={() => open(presets.find((p) => p.id === draft.id)!, true)}>{t('Duplicate to edit')}</Button>}
              {draft.saved && canEdit && (
                <Button variant="danger" onClick={() => void remove(draft.id)}>
                  {t('Remove')}
                </Button>
              )}
              {!draft.readOnly && (
                <Button type="submit" variant="primary" disabled={!canSave}>
                  {t('Save Casual preset')}
                </Button>
              )}
            </div>
            <Status text={status.text} error={status.error ?? list.error} />
          </header>
          <div className="admin-preset-body">
            <div className="admin-preset-rules">
              <div className="admin-preset-toolbar">
                {text === null ? (
                  <p className="stats-tabs" role="tablist" aria-label={t('Categories')}>
                    {PRESET_FORM_CATEGORIES.map((c) => (
                      <button key={c} type="button" role="tab" aria-selected={category === c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>
                        {t(CATEGORY_LABELS[c] ?? c)}
                        {changedIn(c) > 0 && <Badge tone="accent">{String(changedIn(c))}</Badge>}
                      </button>
                    ))}
                  </p>
                ) : (
                  <p className="admin-muted">{t('One rule per line, as in the gamemod file. Unknown lines show an error below.')}</p>
                )}
                <label className="admin-inline-check">
                  <input
                    type="checkbox"
                    checked={text !== null}
                    onChange={(e) => {
                      if (e.target.checked) return setText(linesFromForm(draft.form));
                      setDraft({ ...draft, form: formFromLines(lines) });
                      setText(null);
                    }}
                  />
                  {t('Text mode (gamemod lines)')}
                </label>
              </div>
              {text !== null ? (
                <textarea
                  className="ui-input ui-textarea admin-preset-text"
                  aria-label={t('Settings (gamemod lines)')}
                  value={text}
                  rows={20}
                  readOnly={draft.readOnly}
                  onChange={(e) => {
                    setText(e.target.value);
                    setDraft({ ...draft, form: formFromLines(e.target.value) });
                  }}
                />
              ) : (
                <ul className="admin-rules">
                  {PRESET_FIELDS.filter((f) => f.def.category === category).map((f) => {
                    const name = f.def.name;
                    const on = name in draft.form.values;
                    const value = draft.form.values[name] ?? defaultFormValue(f);
                    const error = on ? fieldProblem(f, value) : undefined;
                    const range = rangeText(f, t);
                    const id = `rule-${name}`;
                    return (
                      <li key={name} className={`admin-rule${on ? ' on' : ''}${error ? ' invalid' : ''}`}>
                        <div className="admin-rule-head">
                          <input id={id} type="checkbox" checked={on} disabled={draft.readOnly} onChange={(e) => setValue(name, e.target.checked ? defaultFormValue(f) : undefined)} />
                          <label htmlFor={id}>{t(f.label)}</label>
                        </div>
                        <div className="admin-rule-control">
                          {on ? <FieldControl f={f} value={value} disabled={draft.readOnly} onChange={(v) => setValue(name, v)} /> : <span>{t('Default: $1', shown(f, defaultFormValue(f)))}</span>}
                        </div>
                        <small className="admin-rule-meta" role={error ? 'alert' : undefined}>
                          {error ? t('Allowed: $1', range) : on ? `${t('Default: $1', shown(f, defaultFormValue(f)))}${range ? ` · ${range}` : ''}` : <code>{name}</code>}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              )}
              {problems.length > 0 && (
                <ul className="stats-note error" role="alert">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
            <aside className="admin-preset-summary">
              <h3>{changedCount === 0 ? t('Same rules as Classic') : t('$1 rules different from Classic.', String(changedCount))}</h3>
              <p className="admin-muted">{t('Check a rule to change its value; the others stay as in Classic.')}</p>
              <h4>{t('Preview (generated lines)')}</h4>
              <pre className="admin-preset-preview">{lines || t('(no changes: same as Classic)')}</pre>
            </aside>
          </div>
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
  const rotations = useLoad<RotationsData>('/admin/rotations');
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const [form, setForm] = useState({ name: '', text: '' });
  // atalho (OG-378): põe o mapa publicado na rotação em uso, sem redigitar os outros
  const RANKED_KEYS = RANKED_FORMATS.map((f) => `ranked:${f}`);
  const inCasual = (name: string) => rotationInUse(rotations.data, 'casual').maps.includes(name);
  const inRanked = (name: string) => RANKED_KEYS.every((k) => rotationInUse(rotations.data, k).maps.includes(name));
  const add = (name: string, keys: string[]) =>
    keys.reduce<Promise<unknown>>((p, k) => p.then(() => addToRotation(rotations.data, k, name)), Promise.resolve()).then(
      () => {
        setStatus({ text: t('Rotation saved. It applies from the next map change.') });
        rotations.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  const [check, setCheck] = useState<{ ok: boolean; errors: string[]; preview?: { title: string; author: string; width: number; height: number } | null } | null>(null);
  // prévia do arquivo antes de publicar (OG-368): desenhada do texto, com o mesmo parser
  const draft = useMemo(() => {
    const r = form.text ? parseMapFile(`${form.name}.txt`, Uint8Array.from(form.text, (c) => c.charCodeAt(0) & 0xff)) : null;
    return r?.ok ? r.map : null;
  }, [form]);
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
  const maps = list.data?.maps ?? [];
  return (
    <section className="admin-tab">
      {/* envio à esquerda (arquivo → conferir → prévia → publicar); mapas publicados à direita */}
      <div className="admin-maps">
        <form
          className="admin-panel"
          onSubmit={(ev) => {
            ev.preventDefault();
            void verify();
          }}
        >
          <h3>{t('Send a map')}</h3>
          <p className="admin-muted">{t('Send a map .txt in the Outgun format. Once published it can go into the rotations and private rooms, without a new release.')}</p>
          <label className="admin-file">
            <span>{t('Map file (.txt)')}</span>
            <input type="file" accept=".txt,text/plain" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <TextField
            label={t('Map')}
            value={form.name}
            maxLength={64}
            hint={t('The name players see in "Create room" and in the vote.')}
            onChange={(v) => {
              setCheck(null);
              setForm({ ...form, name: v });
            }}
          />
          <Button type="submit" disabled={!form.name || !form.text}>
            {t('Check')}
          </Button>
          {check && !check.ok && (
            <ul className="stats-note error" role="alert">
              {check.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {check?.ok && draft && <MapDrawing map={draft} label={check.preview?.title ?? form.name} />}
          {check?.ok && check.preview && (
            <>
              <p className="admin-muted" role="status">
                {t('$1 by $2, $3×$4 rooms.', check.preview.title, check.preview.author || '-', String(check.preview.width), String(check.preview.height))}
              </p>
              <Button variant="primary" onClick={() => void publish()}>
                {t('Publish map')}
              </Button>
            </>
          )}
        </form>
        <div className="admin-tab">
          <div className="admin-summary">
            <Badge>{t('$1 published maps', String(maps.filter((m) => m.active).length))}</Badge>
            <Status text={status.text} error={status.error ?? list.error} />
          </div>
          <Table
            phoneCards
            caption={t('Maps')}
            rows={maps}
            rowKey={(m) => m.name}
            empty={t('No maps sent yet.')}
            columns={[
              {
                key: 'map',
                header: t('Map'),
                cell: (m) => (
                  <span className="admin-map-name">
                    {m.active && <MapPreview name={m.name} label={m.title} thumb />}
                    <span>
                      <strong>{m.name}</strong>
                      <br />
                      <span className="admin-muted">
                        {m.title} · {m.author || '—'}
                      </span>
                    </span>
                  </span>
                ),
              },
              { key: 'size', header: t('Size'), cell: (m) => `${m.width}×${m.height}`, align: 'end' },
              { key: 'version', header: t('Version'), cell: (m) => (m.active ? m.version : <Badge>{t('inactive')}</Badge>), align: 'end' },
              { key: 'by', header: t('By'), cell: (m) => m.updatedBy ?? '—' },
              {
                key: 'actions',
                header: '',
                align: 'end',
                cell: (m) =>
                  m.active && (
                    <span className="admin-row-actions">
                      {rotations.data && !inCasual(m.name) && (
                        <Button variant="ghost" onClick={() => void add(m.name, ['casual'])}>
                          {t('Add to Casual')}
                        </Button>
                      )}
                      {rotations.data && !inRanked(m.name) && (
                        <Button variant="ghost" onClick={() => void add(m.name, RANKED_KEYS)}>
                          {t('Add to Ranked')}
                        </Button>
                      )}
                      <Button variant="danger" onClick={() => void remove(m.name)}>
                        {t('Deactivate')}
                      </Button>
                    </span>
                  ),
              },
            ]}
          />
        </div>
      </div>
    </section>
  );
}


interface RotationRow {
  key: string;
  maps: string[];
  version: number;
}

interface RotationsData {
  rotations: RotationRow[];
  /** Rotações padrão do servidor (OG-378): valem enquanto o painel não salva a sua. */
  server?: Partial<Record<string, string[]>>;
  catalog: string[];
}

/** Rotação em uso numa chave (OG-378): a do painel; sem ela, a do servidor (formato do Ranked cai na `ranked`). */
function rotationInUse(data: RotationsData | undefined, key: string): { maps: string[]; fromServer: boolean } {
  const saved = (k: string) => data?.rotations.find((r) => r.key === k)?.maps;
  const fallback = key.startsWith('ranked:') ? 'ranked' : undefined;
  const panel = saved(key) ?? (fallback && saved(fallback));
  if (panel) return { maps: panel, fromServer: false };
  return { maps: data?.server?.[key] ?? (fallback && data?.server?.[fallback]) ?? [], fromServer: true };
}

/** Acrescenta um mapa à rotação em uso e salva, sem tirar os outros (OG-378). */
function addToRotation(data: RotationsData | undefined, key: string, map: string) {
  const { maps } = rotationInUse(data, key);
  return maps.includes(map) ? Promise.resolve() : api(`/admin/rotations/${key}`, { method: 'PUT', body: { maps: [...maps, map] } });
}

const ROTATION_FORMAT_KEYS = RANKED_FORMATS.map((f) => `ranked:${f}`);

/**
 * Rotações por modo (OG-383): Casual ou Ranqueado (por formato), numa grade de mapas com miniatura
 * e caixa de marcar, partindo da rotação em uso (OG-378). Sem digitar nomes de arquivo.
 */
function RotationsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = usePrefs();
  const list = useLoad<RotationsData>('/admin/rotations');
  const panel = useLoad<{ maps: PanelMapRow[] }>('/admin/maps');
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual');
  const [format, setFormat] = useState<RankedFormat>(RANKED_FORMATS[0]);
  const [drafts, setDrafts] = useState<Partial<Record<string, string[]>>>({});
  const key = mode === 'casual' ? 'casual' : `ranked:${format}`;
  const inUse = (k: string) => rotationInUse(list.data, k).maps;
  const current = (k: string) => drafts[k] ?? inUse(k);
  const marked = current(key);
  const all = [...new Set([...(list.data?.catalog ?? []), ...['casual', ...ROTATION_FORMAT_KEYS].flatMap(current)])].sort((a, b) => a.localeCompare(b));
  // mapa publicado que ainda não está em nenhuma rotação
  const fresh = new Set((panel.data?.maps ?? []).filter((m) => m.active && !['casual', ...ROTATION_FORMAT_KEYS].some((k) => inUse(k).includes(m.name))).map((m) => m.name));
  const set = (maps: string[]) => setDrafts({ ...drafts, [key]: maps });
  // a ordem da rotação é mantida: mapa marcado entra no fim
  const toggle = (map: string) => set(marked.includes(map) ? marked.filter((m) => m !== map) : [...marked, map]);
  const changed = Object.keys(drafts).filter((k) => drafts[k]!.join('\n') !== inUse(k).join('\n'));
  const empty = changed.some((k) => drafts[k]!.length === 0);
  const save = () =>
    Promise.all(changed.map((k) => api(`/admin/rotations/${k}`, { method: 'PUT', body: { maps: drafts[k] } }))).then(
      () => {
        setDrafts({});
        setStatus({ text: t('Rotation saved. It applies from the next map change.') });
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  return (
    <section className="admin-rotation">
      {/* barra fixa: modo, formato, contador e ações sempre à vista enquanto rola a grade */}
      <div className="admin-bar">
        <p className="stats-tabs" role="tablist" aria-label={t('Mode')}>
          {(['casual', 'ranked'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'casual' ? t('Casual') : t('Ranked')}
            </button>
          ))}
        </p>
        {mode === 'ranked' && (
          <p className="stats-tabs" role="tablist" aria-label={t('Format')}>
            {RANKED_FORMATS.map((f) => (
              <button key={f} type="button" role="tab" aria-selected={format === f} className={format === f ? 'active' : ''} onClick={() => setFormat(f)}>
                {f.replace('x', '×')}
                {changed.includes(`ranked:${f}`) ? ' *' : ''}
              </button>
            ))}
          </p>
        )}
        <span className="admin-rotation-count">
          <strong>{t('$1 of $2 maps checked.', String(marked.length), String(all.length))}</strong>
          {list.data && rotationInUse(list.data, key).fromServer && !drafts[key] && <Badge>{t('server default')}</Badge>}
        </span>
        {canEdit && (
          <span className="admin-rotation-actions">
            <Button variant="ghost" onClick={() => set([...marked, ...all.filter((m) => !marked.includes(m))])} disabled={marked.length === all.length}>
              {t('Check all')}
            </Button>
            <Button variant="ghost" onClick={() => set([])} disabled={marked.length === 0}>
              {t('Uncheck all')}
            </Button>
            <Button disabled={Object.keys(drafts).length === 0} onClick={() => setDrafts({})}>
              {t('Undo changes')}
            </Button>
            <Button variant="primary" disabled={changed.length === 0 || empty} onClick={() => void save()}>
              {t('Save')}
            </Button>
          </span>
        )}
      </div>
      <Status text={status.text ?? (empty ? t('A rotation needs at least one map.') : undefined)} error={status.error ?? list.error} />
      <p className="admin-muted">{t('Changes apply from the next map change.')}</p>
      {list.data && list.data.catalog.length === 0 && <p className="stats-note">{t('No game server has reported its maps yet; only the maps already in the rotations are listed.')}</p>}
      <ul className="admin-map-grid">
        {all.map((m) => (
          <li key={m}>
            <label className={marked.includes(m) ? 'admin-map-card on' : 'admin-map-card'}>
              <input type="checkbox" checked={marked.includes(m)} disabled={!canEdit} onChange={() => toggle(m)} />
              <MapPreview name={m} label={m} thumb />
              <span className="admin-map-card-name">
                {m}
                {fresh.has(m) && <Badge tone="accent">{t('new')}</Badge>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}


interface UserRow {
  username: string;
  role: 'admin' | 'moderator' | 'player';
  clanTag: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

const ROLE_TONE = { admin: 'danger', moderator: 'accent', player: 'neutral' } as const;

/** Papéis (OG-388): as contas em lista, admins e moderadores primeiro; o papel muda na própria linha. */
/** Lista editável de prefixos ou nomes (OG-403): ativo, texto, prévia e remover; `i` = posição na lista inteira. */
function BotEntries(props: { caption: string; rows: { e: BotNameEntry; i: number }[]; prefixes?: boolean; preview: (text: string) => string; onSet: (i: number, patch: Partial<BotNameEntry>) => void; onRemove: (i: number) => void; empty: string }) {
  const { t } = usePrefs();
  return (
    <Table
      phoneCards
      caption={props.caption}
      rows={props.rows}
      rowKey={(r) => String(r.i)}
      empty={props.empty}
      columns={[
        { key: 'active', header: t('Active'), cell: (r) => <input type="checkbox" aria-label={t('Active')} checked={r.e.active} onChange={(ev) => props.onSet(r.i, { active: ev.target.checked })} /> },
        {
          key: 'text',
          header: t('Text'),
          cell: (r) =>
            props.prefixes && r.e.text === '' ? (
              <span className="admin-muted">{t('(no prefix)')}</span>
            ) : (
              <input className="ui-input" aria-label={t('Text')} value={r.e.text} maxLength={props.prefixes ? BOT_PREFIX_MAX_LENGTH : 15} onChange={(ev) => props.onSet(r.i, { text: ev.target.value })} />
            ),
        },
        { key: 'preview', header: t('In the game'), cell: (r) => <code>{props.preview(r.e.text)}</code> },
        {
          key: 'remove',
          header: '',
          cell: (r) => (
            <Button variant="ghost" onClick={() => props.onRemove(r.i)}>
              {t('Remove')}
            </Button>
          ),
        },
      ]}
    />
  );
}

/**
 * Aba Bots (OG-403): cadastro de prefixos e de nomes possíveis. Cada bot que entra sorteia um
 * prefixo e um nome ativos; listas vazias = "BOT " + nome gerado. Vale nos bots que entrarem depois.
 */
function BotsTab() {
  const { t } = usePrefs();
  const saved = useLoad<BotNamesConfig & { chat: BotChatConfig; version: number; updatedAt: string | null }>('/admin/bots');
  const [draft, setDraft] = useState<BotNamesConfig | null>(null);
  const [prefix, setPrefix] = useState('');
  const [paste, setPaste] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const data = draft ?? (saved.data ? { prefixes: saved.data.prefixes, names: saved.data.names } : null);
  if (!data) return <Status error={saved.error} />;
  const edit = (patch: Partial<BotNamesConfig>) => setDraft({ ...data, ...patch });
  const has = (list: BotNameEntry[], text: string) => list.some((e) => e.text.toLowerCase() === text.toLowerCase());
  const firstName = data.names.find((n) => n.active)?.text ?? 'Fulano';
  const firstPrefix = data.prefixes.find((p) => p.active)?.text ?? 'BOT ';
  const addPrefix = (text: string) => {
    if (!has(data.prefixes, text)) edit({ prefixes: [...data.prefixes, { text, active: true }] });
    setPrefix('');
  };
  const addNames = () => {
    const fresh = [...new Set(paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))].filter((n) => !has(data.names, n));
    edit({ names: [...data.names, ...fresh.map((text) => ({ text, active: true }))] });
    setPaste('');
  };
  const save = () =>
    api<BotNamesConfig>('/admin/bots', { method: 'PUT', body: data }).then(
      (r) => {
        setDraft(null);
        saved.reload();
        setStatus({ text: t('Saved: $1 prefixes and $2 names. Bots that join from now on use them.', String(r.prefixes.length), String(r.names.length)) });
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  const query = search.trim().toLowerCase();
  const names = data.names.map((e, i) => ({ e, i })).filter(({ e }) => !query || e.text.toLowerCase().includes(query));
  return (
    <section className="admin-tab">
      <div className="admin-bar">
        <span className="admin-rotation-count">
          <Badge tone="accent">{t('$1 active prefixes', String(data.prefixes.filter((p) => p.active).length))}</Badge>
          <Badge tone="accent">{t('$1 active names', String(data.names.filter((n) => n.active).length))}</Badge>
          <span className="admin-muted">{t('Each bot that joins draws one active prefix and one active name not in use in the room. Empty lists: "BOT " + a generated name.')}</span>
        </span>
        <span className="admin-bar-end">
          {draft && <Button variant="ghost" onClick={() => setDraft(null)}>{t('Discard changes')}</Button>}
          <Button disabled={!draft} onClick={() => void save()}>
            {t('Save changes')}
          </Button>
        </span>
      </div>
      <Status text={status.text} error={status.error ?? saved.error} />
      <div className="admin-bots">
        <section className="admin-tab">
          <h3>{t('Prefixes')}</h3>
          <form
            className="admin-bar"
            onSubmit={(ev: FormEvent) => {
              ev.preventDefault();
              // o espaço do fim fica ("BOT " separa do nome)
              if (prefix.trim()) addPrefix(prefix.trimStart());
            }}
          >
            <TextField label={t('New prefix')} value={prefix} maxLength={BOT_PREFIX_MAX_LENGTH} placeholder="BOT-" onChange={setPrefix} />
            <span className="admin-bar-end">
              <Button type="submit" disabled={!prefix.trim() || data.prefixes.length >= BOT_PREFIXES_MAX}>
                {t('Add')}
              </Button>
              {!has(data.prefixes, '') && (
                <Button variant="ghost" onClick={() => addPrefix('')}>
                  {t('Add "no prefix"')}
                </Button>
              )}
            </span>
          </form>
          <BotEntries
            caption={t('Prefixes')}
            rows={data.prefixes.map((e, i) => ({ e, i }))}
            prefixes
            preview={(p) => p + firstName}
            onSet={(i, patch) => edit({ prefixes: data.prefixes.map((e, j) => (j === i ? { ...e, ...patch } : e)) })}
            onRemove={(i) => edit({ prefixes: data.prefixes.filter((_, j) => j !== i) })}
            empty={t('No prefixes: bots use "BOT ".')}
          />
        </section>
        <section className="admin-tab">
          <h3>{t('Possible names')}</h3>
          <div className="admin-bar">
            <TextAreaField label={t('Add names (one per line)')} value={paste} rows={3} maxLength={8000} onChange={setPaste} />
            <span className="admin-bar-end">
              <Button disabled={!paste.trim() || data.names.length >= BOT_NAMES_MAX} onClick={addNames}>
                {t('Add')}
              </Button>
            </span>
          </div>
          <TextField label={t('Search names')} value={search} maxLength={32} onChange={setSearch} />
          <BotEntries
            caption={t('Possible names')}
            rows={names}
            preview={(n) => firstPrefix + n}
            onSet={(i, patch) => edit({ names: data.names.map((e, j) => (j === i ? { ...e, ...patch } : e)) })}
            onRemove={(i) => edit({ names: data.names.filter((_, j) => j !== i) })}
            empty={query ? t('No names found.') : t('No names: bots get generated names.')}
          />
        </section>
      </div>
      {saved.data && <BotChatEditor saved={saved.data.chat} onSaved={saved.reload} />}
    </section>
  );
}

const BOT_CHAT_LABELS: Readonly<Record<BotChatEvent, string>> = {
  match_start: 'Match start',
  we_captured: 'Team captured',
  they_captured: 'Team gave up the flag',
  flag_returned: 'Flag returned',
  kill_streak: 'Kill streak (5, 10...)',
  killed_by_same: 'Killed 3 times by the same player',
  comeback: 'Score turned around',
  win: 'Victory',
  loss: 'Defeat',
  player_join: 'Player joined',
  player_leave: 'Player left',
};
const BOT_SPEAKER_LABELS: Readonly<Record<BotChatSpeaker, string>> = { involved: 'The bot involved', team: 'A bot of the team', enemy: 'A bot of the other team', any: 'Any bot' };

/** Chat dos bots (OG-404): ligado, teto por minuto e, por acontecimento, chance, quem fala e mensagens. */
function BotChatEditor({ saved, onSaved }: { saved: BotChatConfig; onSaved: () => void }) {
  const { t } = usePrefs();
  const [draft, setDraft] = useState<BotChatConfig | null>(null);
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const chat = draft ?? saved;
  const edit = (patch: Partial<BotChatConfig>) => setDraft({ ...chat, ...patch });
  const rule = (id: BotChatEvent, patch: Partial<BotChatConfig['events'][BotChatEvent]>) => edit({ events: { ...chat.events, [id]: { ...chat.events[id], ...patch } } });
  const save = () =>
    api<BotChatConfig>('/admin/bots/chat', {
      method: 'PUT',
      // linhas em branco da edição não vão
      body: { ...chat, events: Object.fromEntries(BOT_CHAT_EVENTS.map((id) => [id, { ...chat.events[id], messages: chat.events[id].messages.map((m) => m.trim()).filter(Boolean) }])) },
    }).then(
      () => {
        setDraft(null);
        onSaved();
        setStatus({ text: t('Bot chat saved. It applies from the next events on.') });
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  return (
    <section className="admin-tab">
      <h3>{t('Bot chat')}</h3>
      <div className="admin-bar">
        <label className="admin-inline-check">
          <input type="checkbox" checked={chat.enabled} onChange={(e) => edit({ enabled: e.target.checked })} /> {t('Bots talk in the chat (Casual only)')}
        </label>
        <TextField label={t('Messages per minute in the room (max)')} value={String(chat.perMinute)} maxLength={2} onChange={(v) => edit({ perMinute: Math.min(BOT_CHAT_PER_MINUTE_MAX, Number(v.replace(/\D/g, '') || 0)) })} />
        <span className="admin-bar-end">
          {draft && (
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t('Discard changes')}
            </Button>
          )}
          <Button disabled={!draft} onClick={() => void save()}>
            {t('Save chat')}
          </Button>
        </span>
      </div>
      <p className="admin-muted">{t('Each event has a chance of a bot commenting, who talks and the messages (one per line; {name} = the other player). Bots wait 1 to 4 s to "type", never talk twice in a row and wait 20 s between their own messages.')}</p>
      <Status text={status.text} error={status.error} />
      <Table
        phoneCards
        caption={t('Bot chat')}
        rows={BOT_CHAT_EVENTS.map((id) => ({ id, r: chat.events[id] }))}
        rowKey={(x) => x.id}
        columns={[
          { key: 'event', header: t('Event'), cell: (x) => t(BOT_CHAT_LABELS[x.id]) },
          {
            key: 'chance',
            header: t('Chance (%)'),
            cell: (x) => <input className="ui-input admin-chat-chance" aria-label={t('Chance (%)')} inputMode="numeric" value={String(x.r.chance)} maxLength={3} onChange={(e) => rule(x.id, { chance: Math.min(100, Number(e.target.value.replace(/\D/g, '') || 0)) })} />,
          },
          {
            key: 'speaker',
            header: t('Who talks'),
            cell: (x) => (
              <select className="ui-input" aria-label={t('Who talks')} value={x.r.speaker} onChange={(e) => rule(x.id, { speaker: e.target.value as BotChatSpeaker })}>
                {BOT_CHAT_SPEAKERS.map((s) => (
                  <option key={s} value={s}>
                    {t(BOT_SPEAKER_LABELS[s])}
                  </option>
                ))}
              </select>
            ),
          },
          {
            key: 'messages',
            header: t('Messages'),
            cell: (x) => <textarea className="ui-input admin-chat-messages" aria-label={t('Messages')} rows={3} value={x.r.messages.join('\n')} onChange={(e) => rule(x.id, { messages: e.target.value.split('\n') })} />,
          },
        ]}
      />
    </section>
  );
}

function RolesTab() {
  const { t } = usePrefs();
  const { user } = useAccount();
  const [search, setSearch] = useState('');
  const list = useLoad<{ total: number; users: UserRow[] }>(`/admin/users${search.trim() ? `?busca=${encodeURIComponent(search.trim())}` : ''}`);
  const [status, setStatus] = useState<{ text?: string; error?: string }>({});
  const roleName = (r: UserRow['role']) => t(r);
  const change = (username: string, role: UserRow['role']) =>
    api<{ username: string; role: string }>(`/admin/users/${encodeURIComponent(username)}/role`, { method: 'PUT', body: { role } }).then(
      (r) => {
        setStatus({ text: t('$1 is now $2.', r.username, roleName(r.role as UserRow['role'])) });
        list.reload();
      },
      (e: unknown) => setStatus({ error: errorText(e) }),
    );
  const rows = list.data?.users ?? [];
  const count = (r: UserRow['role']) => rows.filter((u) => u.role === r).length;
  return (
    <section className="admin-roles">
      <div className="admin-bar">
        <TextField label={t('Search account')} value={search} maxLength={32} placeholder={t('name')} onChange={setSearch} />
        <span className="admin-rotation-count">
          <Badge tone="danger">{t('$1 admins', String(count('admin')))}</Badge>
          <Badge tone="accent">{t('$1 moderators', String(count('moderator')))}</Badge>
          {list.data && <span className="admin-muted">{t('$1 accounts in total', String(list.data.total))}</span>}
        </span>
      </div>
      <Status text={status.text} error={status.error ?? list.error} />
      <Table
        phoneCards
        caption={t('Roles')}
        rows={rows}
        rowKey={(u) => u.username}
        empty={t('No accounts found.')}
        columns={[
          { key: 'name', header: t('Account'), cell: (u) => <Link to={`/players/${encodeURIComponent(u.username)}`}>{u.username}</Link> },
          { key: 'role', header: t('Role'), cell: (u) => <Badge tone={ROLE_TONE[u.role]}>{roleName(u.role)}</Badge> },
          { key: 'clan', header: t('Clan'), cell: (u) => u.clanTag ?? '—' },
          { key: 'created', header: t('Created'), cell: (u) => new Date(u.createdAt).toLocaleDateString() },
          { key: 'seen', header: t('Last seen'), cell: (u) => (u.lastSeenAt ? when(u.lastSeenAt) : '—') },
          {
            key: 'change',
            header: t('Change role'),
            cell: (u) => (
              <select className="ui-input admin-role-select" aria-label={t('Role of $1', u.username)} value={u.role} disabled={u.username === user?.username} onChange={(e) => void change(u.username, e.target.value as UserRow['role'])}>
                <option value="player">{t('player')}</option>
                <option value="moderator">{t('moderator')}</option>
                <option value="admin">{t('admin')}</option>
              </select>
            ),
          },
        ]}
      />
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
  bug: BugReport | null;
  githubIssue: number | null;
  githubUrl: string | null;
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

/** Relato de bug do site (OG-429): resumo à vista; campos do modelo e contexto ao abrir. */
function BugDetails({ bug, context }: { readonly bug: BugReport; readonly context: Record<string, string | number> }) {
  const { t } = usePrefs();
  const rows: [string, string][] = [
    [t('Where did it happen?'), areaLabels(t)[bug.area]],
    [t('Severity'), severityLabels(t)[bug.severity]],
    [t('How often?'), frequencyLabels(t)[bug.frequency]],
    [t('Steps to reproduce'), bug.steps],
    [t('What I expected'), bug.expected],
    [t('What happened'), bug.actual],
    [t('Evidence (links to the match, screenshots, videos)'), bug.evidence],
    [t('Known workaround'), bug.workaround],
    ...Object.entries(context).map(([k, v]): [string, string] => [k, String(v)]),
  ];
  return (
    <details className="admin-wrap admin-bug">
      <summary>{bug.summary}</summary>
      <dl>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="admin-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </details>
  );
}

/** Prévia e abertura da issue do GitHub de um relato de bug (OG-430). */
function IssueDialog({ id, onClose }: { readonly id: number; readonly onClose: (done: string | null) => void }) {
  const { t } = usePrefs();
  const preview = useLoad<{ draft?: { title: string; body: string; labels: string[] }; issue?: { number: number; url: string } }>(`/admin/feedback/${id}/issue`, 0);
  const [title, setTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const draft = preview.data?.draft;
  const create = () => {
    setBusy(true);
    api<{ number: number }>(`/admin/feedback/${id}/issue`, { body: title ? { title } : {} }).then(
      (r) => onClose(t('Issue #$1 opened on GitHub.', String(r.number))),
      (e: unknown) => {
        setBusy(false);
        setError(errorText(e));
      },
    );
  };
  return (
    <Dialog
      open
      title={t('Open issue on GitHub')}
      closeLabel={t('Close')}
      onClose={() => onClose(null)}
      actions={
        <>
          <Button onClick={() => onClose(null)}>{t('Cancel')}</Button>
          <Button variant="primary" disabled={!draft || busy} onClick={create}>
            {t('Open issue')}
          </Button>
        </>
      }
    >
      <Status error={error ?? preview.error} />
      {draft && (
        <>
          <TextField label={t('Title')} value={title ?? draft.title} maxLength={250} onChange={setTitle} />
          <p className="admin-muted">{t('Labels: $1. The repository is public: everyone will see this text.', draft.labels.join(', '))}</p>
          <pre className="admin-issue-body">{draft.body}</pre>
        </>
      )}
    </Dialog>
  );
}

/** Feedback do beta (OG-106): resumo da fidelidade (critério do lançamento), filtros e triagem. */
function FeedbackTab() {
  const { t } = usePrefs();
  const [status, setStatus] = useState('');
  const query = status ? `?status=${status}` : '';
  const list = useLoad<{ summary: { all: Summary; veterans: Summary; openCritical: number }; feedback: FeedbackRow[]; github: boolean }>(`/admin/feedback${query}`, 15_000);
  const [issueFor, setIssueFor] = useState<number | null>(null);
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
  const sum = list.data?.summary;
  const stars = (x: Summary) => x.distribution.map((n, i) => `${i + 1}★ ${n}`).join(' · ');
  return (
    <section className="admin-tab">
      {sum && (
        <div className="admin-tiles">
          <div className="admin-tile">
            <span className="admin-muted">{t('Fidelity, veterans (goal: 20 with average 4+)')}</span>
            <strong>{sum.veterans.average ?? '—'}</strong>
            <span className="admin-muted">
              {t('$1 people', String(sum.veterans.people))} · {stars(sum.veterans)}
            </span>
          </div>
          <div className="admin-tile">
            <span className="admin-muted">{t('Fidelity, everyone')}</span>
            <strong>{sum.all.average ?? '—'}</strong>
            <span className="admin-muted">
              {t('$1 people', String(sum.all.people))} · {stars(sum.all)}
            </span>
          </div>
          <div className={sum.openCritical > 0 ? 'admin-tile danger' : 'admin-tile'}>
            <span className="admin-muted">{t('Open critical bugs')}</span>
            <strong>{sum.openCritical}</strong>
          </div>
        </div>
      )}
      <div className="admin-bar">
        <p className="stats-tabs" role="tablist" aria-label={t('Status')}>
          {['', ...STATUSES].map((s) => (
            <button key={s} type="button" role="tab" aria-selected={s === status} className={s === status ? 'active' : ''} onClick={() => setStatus(s)}>
              {s ? label[s] : t('All')}
            </button>
          ))}
        </p>
        <span className="admin-bar-end">
          <a className="ui-button ui-button-ghost ui-button-md" href={`${API_URL}/admin/feedback.csv${query}`}>
            {t('Download CSV')}
          </a>
          <Button
            variant="ghost"
            onClick={() => {
              // erro lançado do código do jogo (não do console): confere no Sentry a pilha com a linha original (OG-434)
              setTimeout(() => {
                throw new Error('Erro de teste do painel (Sentry)');
              });
              setMsg({ text: t('Test error sent to the error service.') });
            }}
          >
            {t('Send test error')}
          </Button>
        </span>
      </div>
      <Status text={msg.text} error={msg.error ?? list.error} />
      <Table
        phoneCards
        caption={t('Feedback')}
        rows={list.data?.feedback ?? []}
        rowKey={(f) => String(f.id)}
        empty={t('No feedback here.')}
        columns={[
          { key: 'date', header: t('Date'), cell: (f) => when(f.createdAt) },
          {
            key: 'player',
            header: t('Player'),
            cell: (f) => (
              <span className="admin-roster-name">
                {f.username}
                {f.veteran && <Badge tone="accent">{t('veteran')}</Badge>}
              </span>
            ),
          },
          { key: 'type', header: t('Type'), cell: (f) => f.kind },
          { key: 'fidelity', header: t('Fidelity'), cell: (f) => f.fidelity ?? '—', align: 'end' },
          { key: 'overall', header: t('Overall'), cell: (f) => f.overall ?? '—', align: 'end' },
          {
            key: 'text',
            header: t('Text'),
            cell: (f) =>
              f.bug ? (
                <BugDetails bug={f.bug} context={f.context} />
              ) : (
                <span className="admin-wrap" title={Object.entries(f.context).map(([k, v]) => `${k}: ${v}`).join('\n')}>
                  {f.text}
                </span>
              ),
          },
          {
            key: 'issue',
            header: t('Issue'),
            cell: (f) =>
              f.githubUrl ? (
                <a href={f.githubUrl} target="_blank" rel="noreferrer">
                  #{f.githubIssue}
                </a>
              ) : f.bug && list.data?.github ? (
                <Button onClick={() => setIssueFor(f.id)}>
                  {t('Open issue')}
                </Button>
              ) : (
                '—'
              ),
          },
          {
            key: 'status',
            header: t('Status'),
            cell: (f) => (
              <select className="ui-input admin-role-select" value={f.status} onChange={(e) => void triage(f.id, e.target.value)} aria-label={t('Status')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {label[s]}
                  </option>
                ))}
              </select>
            ),
          },
        ]}
      />
      {issueFor !== null && (
        <IssueDialog
          id={issueFor}
          onClose={(done) => {
            setIssueFor(null);
            if (done) {
              setMsg({ text: done });
              list.reload();
            }
          }}
        />
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
  const digits = (v: string) => v.replace(/\D/g, '');
  return (
    <section className="admin-tab">
      {list.data && !list.data.beta && <p className="stats-note">{t('The server is not in closed beta (BETA=1): invites are not required to sign up.')}</p>}
      <form className="admin-bar" onSubmit={create}>
        <TextField label={t('How many')} value={form.count} maxLength={3} onChange={(v) => setForm({ ...form, count: digits(v) })} />
        <TextField label={t('Uses each')} value={form.maxUses} maxLength={4} onChange={(v) => setForm({ ...form, maxUses: digits(v) })} />
        <TextField label={t('Days valid (empty = no end)')} value={form.expiresDays} maxLength={4} onChange={(v) => setForm({ ...form, expiresDays: digits(v) })} />
        <TextField label={t('Note')} value={form.note} maxLength={200} onChange={(v) => setForm({ ...form, note: v })} />
        <span className="admin-bar-end">
          <Button type="submit" variant="primary">
            {t('Create invites')}
          </Button>
        </span>
      </form>
      <Status text={msg.text} error={msg.error ?? list.error} />
      <Table
        phoneCards
        caption={t('Invites')}
        rows={list.data?.invites ?? []}
        rowKey={(i) => i.code}
        empty={t('No invites yet.')}
        columns={[
          { key: 'link', header: t('Invite link'), cell: (i) => <code className="admin-wrap">{i.revoked ? i.code : link(i.code)}</code> },
          { key: 'uses', header: t('Uses'), cell: (i) => `${i.uses}/${i.maxUses}`, align: 'end' },
          { key: 'by', header: t('Used by'), cell: (i) => <span className="admin-wrap">{i.usedBy.join(', ') || '—'}</span> },
          { key: 'note', header: t('Note'), cell: (i) => <span className="admin-wrap">{i.note}</span> },
          { key: 'until', header: t('Until'), cell: (i) => (i.revoked ? <Badge tone="danger">{t('revoked')}</Badge> : i.expiresAt ? when(i.expiresAt) : t('no end')) },
          {
            key: 'actions',
            header: '',
            align: 'end',
            cell: (i) =>
              !i.revoked &&
              i.uses < i.maxUses && (
                <span className="admin-row-actions">
                  <Button variant="ghost" onClick={() => void copyText(link(i.code))}>
                    {t('Copy link')}
                  </Button>
                  <Button variant="ghost" onClick={() => void revoke(i.code)}>
                    {t('Revoke')}
                  </Button>
                </span>
              ),
          },
        ]}
      />
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
  const regions = net.data?.regions ?? [];
  const total = regions.reduce((n, r) => n + r.reports, 0);
  const minutes = Math.round(regions.reduce((n, r) => n + r.seconds, 0) / 60);
  // ping mediano ponderado pelas partidas de cada região
  const ping = total ? Math.round(regions.reduce((n, r) => n + (r.ping_p50 ?? 0) * r.reports, 0) / total) : null;
  return (
    <section className="admin-tab">
      <div className="admin-bar">
        <p className="stats-tabs" role="tablist" aria-label={t('Period')}>
          {[1, 7, 30].map((d) => (
            <button key={d} type="button" role="tab" aria-selected={d === days} className={d === days ? 'active' : ''} onClick={() => setDays(d)}>
              {t('$1 days', String(d))}
            </button>
          ))}
        </p>
        <span className="admin-muted">{t('Anonymous summaries sent by the players at the end of each match.')}</span>
      </div>
      <div className="admin-tiles">
        <div className="admin-tile">
          <span className="admin-muted">{t('Matches')}</span>
          <strong>{total}</strong>
        </div>
        <div className="admin-tile">
          <span className="admin-muted">{t('Minutes played')}</span>
          <strong>{minutes}</strong>
        </div>
        <div className="admin-tile">
          <span className="admin-muted">{t('Regions')}</span>
          <strong>{regions.length}</strong>
        </div>
        <div className="admin-tile">
          <span className="admin-muted">{t('Typical ping (ms)')}</span>
          <strong>{ping ?? '—'}</strong>
        </div>
      </div>
      <Status error={net.error} />
      <Table
        phoneCards
        caption={t('Network')}
        rows={regions}
        rowKey={(r) => r.region}
        empty={t('No reports yet.')}
        columns={[
          { key: 'region', header: t('Region'), cell: (r) => <strong>{r.region}</strong> },
          { key: 'matches', header: t('Matches'), cell: (r) => r.reports, align: 'end' },
          { key: 'minutes', header: t('Minutes'), cell: (r) => Math.round(r.seconds / 60), align: 'end' },
          { key: 'ping', header: t('Ping p50 / p95 (ms)'), cell: (r) => `${r.ping_p50 ?? '—'} / ${r.ping_p95 ?? '—'}`, align: 'end' },
          { key: 'lag', header: t('Control delay p50 (ms)'), cell: (r) => r.lag_p50, align: 'end' },
          { key: 'corr', header: t('Corrections/min'), cell: (r) => r.corrections_per_min, align: 'end' },
          { key: 'fps', header: t('fps p5'), cell: (r) => r.fps_p5, align: 'end' },
          { key: 'stall', header: t('Frame drops'), cell: (r) => `${r.stall_pct}%`, align: 'end' },
        ]}
      />
    </section>
  );
}
