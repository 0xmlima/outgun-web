// SPDX-License-Identifier: GPL-2.0-or-later
// Convites e pedidos de clã (OG-271, RN-CLA-04): o contador do menu inicial e a lista do que está
// pendente — convites recebidos, o próprio pedido e, para líder/admin, os pedidos ao clã.
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useAccount, type AccountUser } from '../app/account.js';
import { api, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { TextAreaField, TextField } from '../ui/Field.js';
import { Form, FormMessageLine, Page, type FormMessage } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import { useToast } from '../ui/Toast.js';
import { PlayerLink, Status, useApi } from './stats.js';

interface ClanRef {
  readonly name: string;
  readonly tag: string;
  readonly expiresAt: string;
}
export interface ClanInbox {
  readonly invites: readonly ClanRef[];
  readonly request: ClanRef | null;
  readonly clanRequests: number;
  readonly cooldownUntil: string | null;
}
interface Pending {
  readonly username: string;
  readonly expiresAt: string;
}

/** Caixa de convites e pedidos do jogador logado; `undefined` sem conta ou enquanto carrega. */
export function useClanInbox(): { inbox: ClanInbox | undefined; reload: () => void } {
  const { user } = useAccount();
  const [inbox, setInbox] = useState<ClanInbox>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!user) return setInbox(undefined);
    let alive = true;
    api<ClanInbox>('/clans/inbox').then(
      (r) => alive && setInbox(r),
      () => alive && setInbox(undefined),
    );
    return () => {
      alive = false;
    };
  }, [user, tick]);
  return { inbox, reload: useCallback(() => setTick((n) => n + 1), []) };
}

/** Quantos itens pedem resposta do jogador (contador do menu). */
export const inboxCount = (inbox: ClanInbox | undefined) => (inbox ? inbox.invites.length + inbox.clanRequests : 0);

const clanPath = (tag: string) => `/clans/${encodeURIComponent(tag)}`;

export function ClanInboxScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, setUser } = useAccount();
  const { inbox, reload } = useClanInbox();
  const [requests, setRequests] = useState<readonly Pending[]>([]);
  const staffTag = inbox && inbox.clanRequests > 0 ? user?.clanTag : undefined;

  useEffect(() => {
    if (!staffTag) return setRequests([]);
    let alive = true;
    api<{ requests: Pending[] }>(`${clanPath(staffTag)}/pending`).then(
      (r) => alive && setRequests(r.requests),
      () => alive && setRequests([]),
    );
    return () => {
      alive = false;
    };
  }, [staffTag, inbox]);

  if (user === null) return <Navigate to="/login" replace />;

  const errorText = (e: unknown) => {
    switch (e instanceof ApiError ? e.code : '') {
      case 'already_in_clan':
        return t('Leave your clan before joining another.');
      case 'clan_cooldown':
        return t('You left a clan recently. Wait 7 days to join another.');
      case 'clan_full':
        return t('The clan is full.');
      case 'request_open':
        return t('You already have an open request.');
      default:
        return t('Something went wrong. Try again.');
    }
  };
  const act = async (path: string, method = 'POST') => {
    try {
      await api(path, { method });
      setUser((await api<{ user: AccountUser }>('/auth/me')).user); // a tag muda ao entrar no clã
      reload();
    } catch (e) {
      toast(errorText(e), 'danger');
      reload();
    }
  };
  const until = (iso: string) => t('Expires on $1', new Date(iso).toLocaleDateString());

  return (
    <Page title={t('Clan invites')} width="narrow" onBack={() => void navigate('/')} backLabel={t('Back')}>
      {inbox?.cooldownUntil && <p className="ui-muted">{t('You can join another clan on $1.', new Date(inbox.cooldownUntil).toLocaleDateString())}</p>}
      <Panel title={t('Invites received')}>
        {!inbox || inbox.invites.length === 0 ? (
          <p className="ui-muted">{inbox ? t('No invites.') : t('Loading...')}</p>
        ) : (
          <ul className="ui-stack">
            {inbox.invites.map((i) => (
              <li key={i.tag} className="ui-row">
                <span className="ui-grow">
                  <Link to={clanPath(i.tag)}>
                    ({i.tag}) {i.name}
                  </Link>{' '}
                  <span className="ui-muted">{until(i.expiresAt)}</span>
                </span>
                <Button variant="primary" onClick={() => void act(`${clanPath(i.tag)}/invites/accept`)}>
                  {t('Accept')}
                </Button>
                <Button variant="ghost" onClick={() => void act(`${clanPath(i.tag)}/invites/decline`)}>
                  {t('Decline')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {inbox?.request && (
        <Panel title={t('Your request')}>
          <div className="ui-row">
            <span className="ui-grow">
              <Link to={clanPath(inbox.request.tag)}>
                ({inbox.request.tag}) {inbox.request.name}
              </Link>{' '}
              <span className="ui-muted">{until(inbox.request.expiresAt)}</span>
            </span>
            <Button variant="ghost" onClick={() => void act(`${clanPath(inbox.request!.tag)}/requests`, 'DELETE')}>
              {t('Withdraw')}
            </Button>
          </div>
        </Panel>
      )}
      {staffTag && requests.length > 0 && (
        <Panel title={t('Requests to your clan')}>
          <ul className="ui-stack">
            {requests.map((r) => (
              <li key={r.username} className="ui-row">
                <span className="ui-grow">
                  <Link to={`/players/${encodeURIComponent(r.username)}`}>{r.username}</Link> <span className="ui-muted">{until(r.expiresAt)}</span>
                </span>
                <Button variant="primary" onClick={() => void act(`${clanPath(staffTag)}/requests/${encodeURIComponent(r.username)}/approve`)}>
                  {t('Approve')}
                </Button>
                <Button variant="ghost" onClick={() => void act(`${clanPath(staffTag)}/requests/${encodeURIComponent(r.username)}/decline`)}>
                  {t('Decline')}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------
// Telas de clã (OG-272): diretório com busca, criar, página do clã e gestão conforme o papel.

type Role = 'leader' | 'admin' | 'member';
interface ClanMember {
  readonly username: string;
  readonly role: Role;
  readonly joinedAt: string;
}
interface ClanPage {
  readonly name: string;
  readonly tag: string;
  readonly description: string;
  readonly createdAt: string;
  readonly members: readonly ClanMember[];
}
interface ClanListing {
  readonly total: number;
  readonly clans: readonly { name: string; tag: string; members: number; createdAt: string }[];
}

/** Mensagem de erro das rotas de clã. */
function useClanErrorText(): (e: unknown) => string {
  const { t } = usePrefs();
  return (e) => {
    switch (e instanceof ApiError ? e.code : '') {
      case 'already_in_clan':
        return t('Leave your clan before joining another.');
      case 'clan_cooldown':
        return t('You left a clan recently. Wait 7 days to join another.');
      case 'clan_full':
        return t('The clan is full.');
      case 'request_open':
        return t('You already have an open request.');
      case 'clan_tag_taken':
        return t('This tag is already taken.');
      case 'clan_name_taken':
        return t('This clan name is already taken.');
      case 'invalid_clan_tag':
        return t('Invalid tag: 1 or 2 characters, no parentheses.');
      case 'invalid_clan_name':
        return t('Invalid name: 3 to 24 characters.');
      case 'player_not_found':
        return t('Player not found.');
      case 'already_member':
        return t('This player is already in the clan.');
      case 'request_pending':
        return t('This player already asked to join: approve the request.');
      case 'invite_pending':
        return t('This clan already invited you: accept the invite.');
      case 'clan_forbidden':
        return t('Your role in the clan does not allow this.');
      case 'name_not_allowed':
        return t('This name is not allowed.');
      default:
        return t('Something went wrong. Try again.');
    }
  };
}

/** Botão de ação destrutiva com confirmação na própria linha. */
function ConfirmButton({ label, confirmLabel, onConfirm, danger = true }: { readonly label: string; readonly confirmLabel: string; readonly onConfirm: () => void; readonly danger?: boolean }) {
  const { t } = usePrefs();
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button variant={danger ? 'danger' : 'secondary'} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  return (
    <span className="ui-row" role="group" aria-label={confirmLabel}>
      <span>{confirmLabel}</span>
      <Button variant="danger" autoFocus onClick={() => (setAsking(false), onConfirm())}>
        {t('Yes')}
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        {t('No')}
      </Button>
    </span>
  );
}

export function ClansScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user } = useAccount();
  const { inbox } = useClanInbox();
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const list = useApi<ClanListing>(`/clans?${new URLSearchParams({ busca: term, limit: '50' })}`);
  const pending = inboxCount(inbox);
  return (
    <Page title={t('Clans')} onBack={() => void navigate(-1)} backLabel={t('Back')}>
      {user && (
        <div className="ui-row">
          {user.clanTag ? (
            <Button variant="primary" onClick={() => void navigate(clanPath(user.clanTag!))}>
              {t('My clan')} ({user.clanTag})
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void navigate('/clans/new')}>
              {t('Create clan')}
            </Button>
          )}
          {(pending > 0 || inbox?.request) && (
            <Button onClick={() => void navigate('/clans/inbox')}>
              {t('Clan invites')} {pending > 0 && <Badge tone="accent">{pending}</Badge>}
            </Button>
          )}
        </div>
      )}
      <Panel>
        <TextField label={t('Search by clan name or tag')} value={query} onChange={setQuery} maxLength={32} autoFocus />
        {list.data ? (
          <Table
            caption={t('Clans')}
            rows={list.data.clans}
            rowKey={(r) => r.tag}
            onRowActivate={(r) => void navigate(clanPath(r.tag))}
            empty={term ? t('Nobody found.') : t('No clans yet.')}
            columns={[
              { key: 'clan', header: t('Clan'), cell: (r) => <Link to={clanPath(r.tag)}>({r.tag}) {r.name}</Link> },
              { key: 'members', header: t('Members'), cell: (r) => r.members, align: 'end' },
              { key: 'since', header: t('Founded'), cell: (r) => new Date(r.createdAt).toLocaleDateString(), align: 'end' },
            ]}
          />
        ) : (
          <Status loading={list.data === undefined} missing={false} error={list.error} />
        )}
        <p className="ui-muted">{t('The clan tag is now the tag of your clan: free tags were removed. Create or join a clan to show a tag as "(TAG) name".')}</p>
      </Panel>
    </Page>
  );
}

export function CreateClanScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user, setUser } = useAccount();
  const errorText = useClanErrorText();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<FormMessage>(null);
  if (user === null) return <Navigate to="/login" replace />;
  if (user?.clanTag) return <Navigate to={clanPath(user.clanTag)} replace />;
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ clan: ClanPage }>('/clans', { method: 'POST', body: { name: name.trim(), tag: tag.trim(), description } });
      setUser((await api<{ user: AccountUser }>('/auth/me')).user);
      void navigate(clanPath(r.clan.tag), { replace: true });
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title={t('Create clan')} width="narrow" onBack={() => void navigate('/clans')} backLabel={t('Back')}>
      <Panel>
        <Form
          label={t('Create clan')}
          onSubmit={() => void submit()}
          actions={
            <Button type="submit" variant="primary" block disabled={busy}>
              {t('Create clan')}
            </Button>
          }
        >
          <TextField label={t('Clan name')} value={name} onChange={setName} maxLength={24} hint={t('3 to 24 characters.')} autoFocus />
          <TextField label={t('Tag')} value={tag} onChange={setTag} maxLength={2} hint={t('1 or 2 characters, shown in game as "(TAG) name".')} />
          <TextAreaField label={t('Description')} value={description} onChange={setDescription} maxLength={500} rows={4} />
        </Form>
        <FormMessageLine message={message} />
      </Panel>
    </Page>
  );
}

export function ClanScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const toast = useToast();
  const errorText = useClanErrorText();
  const { tag = '' } = useParams();
  const { user, setUser } = useAccount();
  const [tick, setTick] = useState(0);
  const page = useApi<{ clan: ClanPage }>(`${clanPath(tag)}?v=${tick}`);
  const clan = page.data?.clan;
  const myRole = clan?.members.find((m) => m.username === user?.username)?.role;
  const staff = myRole === 'leader' || myRole === 'admin';

  const act = async (path: string, init: { method?: string; body?: unknown } = {}, after?: () => void) => {
    try {
      await api(path, { method: 'POST', ...init });
      setUser((await api<{ user: AccountUser }>('/auth/me')).user);
      if (after) after();
      else setTick((n) => n + 1);
      return true;
    } catch (e) {
      toast(errorText(e), 'danger');
      return false;
    }
  };

  if (!clan) {
    return (
      <Page title={t('Clan')} onBack={() => void navigate('/clans')} backLabel={t('Back')}>
        <Status loading={page.data === undefined && !page.error} missing={page.data === null} error={page.error} />
      </Page>
    );
  }
  const base = clanPath(clan.tag);
  const roleName = (r: Role) => (r === 'leader' ? t('Leader') : r === 'admin' ? t('Admin') : t('Member'));
  const canKick = (m: ClanMember) => m.username !== user?.username && (myRole === 'leader' || (myRole === 'admin' && m.role === 'member'));

  return (
    <Page
      title={`(${clan.tag}) ${clan.name}`}
      subtitle={`${t('Founded on $1', new Date(clan.createdAt).toLocaleDateString())} · ${t('$1 members', String(clan.members.length))}`}
      onBack={() => void navigate('/clans')}
      backLabel={t('Back')}
    >
      {clan.description && (
        <Panel>
          <p className="clan-description">{clan.description}</p>
        </Panel>
      )}
      <Panel title={t('Members')}>
        <Table
          caption={t('Members')}
          rows={clan.members}
          rowKey={(m) => m.username}
          columns={[
            { key: 'name', header: t('Player'), cell: (m) => <PlayerLink name={m.username} username={m.username} /> },
            { key: 'role', header: t('Role'), cell: (m) => (m.role === 'member' ? roleName(m.role) : <Badge tone={m.role === 'leader' ? 'accent' : 'neutral'}>{roleName(m.role)}</Badge>) },
            { key: 'since', header: t('Since'), cell: (m) => new Date(m.joinedAt).toLocaleDateString(), align: 'end' },
            ...(staff
              ? [
                  {
                    key: 'actions',
                    header: t('Actions'),
                    cell: (m: ClanMember) => (
                      <span className="ui-row">
                        {myRole === 'leader' && m.role !== 'leader' && (
                          <Button onClick={() => void act(`${base}/members/${encodeURIComponent(m.username)}/role`, { method: 'PUT', body: { role: m.role === 'admin' ? 'member' : 'admin' } })}>
                            {m.role === 'admin' ? t('Demote') : t('Promote')}
                          </Button>
                        )}
                        {myRole === 'leader' && m.role !== 'leader' && (
                          <ConfirmButton danger={false} label={t('Make leader')} confirmLabel={t('Pass the leadership to $1?', m.username)} onConfirm={() => void act(`${base}/transfer`, { body: { username: m.username } })} />
                        )}
                        {canKick(m) && <ConfirmButton label={t('Remove')} confirmLabel={t('Remove $1 from the clan?', m.username)} onConfirm={() => void act(`${base}/members/${encodeURIComponent(m.username)}`, { method: 'DELETE' })} />}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Panel>
      {staff && <ManageClan clan={clan} leader={myRole === 'leader'} act={act} tick={tick} />}
      {user && (
        <Panel>
          <div className="ui-row">
            {myRole ? (
              <ConfirmButton
                label={t('Leave clan')}
                confirmLabel={clan.members.length === 1 ? t('You are the last member: leaving dissolves the clan. Leave?') : t('Leave the clan? You will wait 7 days to join another.')}
                onConfirm={() => void act(`${base}/leave`, {}, () => void navigate('/clans'))}
              />
            ) : (
              !user.clanTag && (
                <Button variant="primary" onClick={() => void act(`${base}/requests`, {}, () => toast(t('Request sent.'), 'success'))}>
                  {t('Ask to join')}
                </Button>
              )
            )}
            {!myRole && <ReportClan base={base} />}
            {myRole === 'leader' && (
              <ConfirmButton label={t('Dissolve clan')} confirmLabel={t('Dissolve the clan for good? Every member loses the tag.')} onConfirm={() => void act(base, { method: 'DELETE' }, () => void navigate('/clans'))} />
            )}
          </div>
        </Panel>
      )}
    </Page>
  );
}

/** Denúncia do clã (OG-275): vai para as denúncias do painel de moderação. */
function ReportClan({ base }: { readonly base: string }) {
  const { t } = usePrefs();
  const toast = useToast();
  const errorText = useClanErrorText();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open)
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {t('Report clan')}
      </Button>
    );
  const send = () =>
    api(`${base}/report`, { method: 'POST', body: { reason: reason.trim() } }).then(
      () => {
        toast(t('Report sent. Thanks.'), 'success');
        setOpen(false);
        setReason('');
      },
      (e: unknown) => toast(e instanceof ApiError && e.code === 'already_reported' ? t('You already reported this clan.') : errorText(e), 'danger'),
    );
  return (
    <Form
      label={t('Report clan')}
      onSubmit={() => void send()}
      actions={
        <span className="ui-row">
          <Button type="submit" variant="danger" disabled={!reason.trim()}>
            {t('Send report')}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('Cancel')}
          </Button>
        </span>
      }
    >
      <TextField label={t('What is wrong with this clan?')} value={reason} onChange={setReason} maxLength={200} autoFocus />
    </Form>
  );
}

/** Edição, convite e pedidos pendentes (líder e admins; a tag só o líder muda). */
function ManageClan({ clan, leader, act, tick }: { readonly clan: ClanPage; readonly leader: boolean; readonly act: (path: string, init?: { method?: string; body?: unknown }, after?: () => void) => Promise<boolean>; readonly tick: number }) {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const toast = useToast();
  const base = clanPath(clan.tag);
  const [name, setName] = useState(clan.name);
  const [tag, setTag] = useState(clan.tag);
  const [description, setDescription] = useState(clan.description);
  const [invitee, setInvitee] = useState('');
  const pending = useApi<{ invites: Pending[]; requests: Pending[] }>(`${base}/pending?v=${tick}`);
  const save = () => {
    const body = { name: name.trim(), description, ...(leader ? { tag: tag.trim() } : {}) };
    void act(base, { method: 'PATCH', body }, () => {
      toast(t('Saved.'), 'success');
      void navigate(clanPath(body.tag ?? clan.tag), { replace: true });
    });
  };
  const invite = () =>
    void act(`${base}/invites`, { body: { username: invitee.trim() } }).then((ok) => {
      if (!ok) return;
      toast(t('Invite sent to $1.', invitee.trim()), 'success');
      setInvitee('');
    });
  return (
    <div className="report-grid">
      <Panel title={t('Invite a player')}>
        <Form
          label={t('Invite a player')}
          onSubmit={invite}
          actions={
            <Button type="submit" disabled={!invitee.trim()}>
              {t('Invite')}
            </Button>
          }
        >
          <TextField label={t('Username')} value={invitee} onChange={setInvitee} maxLength={32} />
        </Form>
        {pending.data && pending.data.requests.length > 0 && (
          <>
            <h3 className="ui-panel-title">{t('Requests to your clan')}</h3>
            <ul className="ui-stack">
              {pending.data.requests.map((r) => (
                <li key={r.username} className="ui-row">
                  <span className="ui-grow">
                    <PlayerLink name={r.username} username={r.username} />
                  </span>
                  <Button variant="primary" onClick={() => void act(`${base}/requests/${encodeURIComponent(r.username)}/approve`)}>
                    {t('Approve')}
                  </Button>
                  <Button variant="ghost" onClick={() => void act(`${base}/requests/${encodeURIComponent(r.username)}/decline`)}>
                    {t('Decline')}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        {pending.data && pending.data.invites.length > 0 && (
          <p className="ui-muted">
            {t('Invites waiting for an answer:')} {pending.data.invites.map((i) => i.username).join(', ')}
          </p>
        )}
      </Panel>
      <Panel title={t('Edit clan')}>
        <Form
          label={t('Edit clan')}
          onSubmit={save}
          actions={
            <Button type="submit" variant="primary">
              {t('Save')}
            </Button>
          }
        >
          <TextField label={t('Clan name')} value={name} onChange={setName} maxLength={24} />
          <TextField label={t('Tag')} value={tag} onChange={setTag} maxLength={2} disabled={!leader} hint={leader ? undefined : t('Only the leader changes the tag.')} />
          <TextAreaField label={t('Description')} value={description} onChange={setDescription} maxLength={500} rows={4} />
        </Form>
      </Panel>
    </div>
  );
}
