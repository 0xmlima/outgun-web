// SPDX-License-Identifier: GPL-2.0-or-later
// Convites e pedidos de clã (OG-271, RN-CLA-04): o contador do menu inicial e a lista do que está
// pendente — convites recebidos, o próprio pedido e, para líder/admin, os pedidos ao clã.
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAccount, type AccountUser } from '../app/account.js';
import { api, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { Button } from '../ui/Button.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { useToast } from '../ui/Toast.js';

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
