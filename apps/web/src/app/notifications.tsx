// SPDX-License-Identifier: GPL-2.0-or-later
// Notificações da conta (OG-361): o sino no topo do site com as não lidas e a lista, e um aviso fixo
// (toast, à direita) para cada não lida que chega; fechar o aviso marca a notificação como lida.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useAccount } from './account.js';
import { api } from './api.js';
import { usePrefs } from './prefs.js';
import { Icon } from '../ui/icons.js';
import { useToast } from '../ui/Toast.js';

/** Releitura das notificações enquanto a aba está visível. */
export const NOTIFICATIONS_POLL_MS = 30_000;

export interface AppNotification {
  id: string;
  kind: 'clan_invite' | 'clan_request';
  data: { clanTag?: string; clanName?: string; from?: string };
  createdAt: string;
  read: boolean;
}

interface Notifications {
  unread: number;
  items: AppNotification[];
  markRead: (id: string) => void;
  markAll: () => void;
}

const NotificationsContext = createContext<Notifications>({ unread: 0, items: [], markRead: () => undefined, markAll: () => undefined });

type T = ReturnType<typeof usePrefs>['t'];

/** Texto da notificação. */
export function notificationText(n: AppNotification, t: T): string {
  const clan = n.data.clanTag ? `(${n.data.clanTag}) ${n.data.clanName ?? ''}`.trim() : '';
  return n.kind === 'clan_invite' ? t('$1 invited you to the clan $2', n.data.from ?? '?', clan) : t('$1 asked to join $2', n.data.from ?? '?', clan);
}

/** Para onde a notificação leva: a caixa de convites ou a página do clã (onde a liderança aprova). */
export const notificationPath = (n: AppNotification) => (n.kind === 'clan_invite' || !n.data.clanTag ? '/clans/inbox' : `/clans/${encodeURIComponent(n.data.clanTag)}`);

export function NotificationsProvider({ children }: { readonly children: ReactNode }) {
  const { t } = usePrefs();
  const { user } = useAccount();
  const toast = useToast();
  const [state, setState] = useState<{ unread: number; items: AppNotification[] }>({ unread: 0, items: [] });
  // avisos já mostrados nesta sessão: a mesma notificação não volta a cada releitura
  const shown = useRef(new Set<string>());

  const load = useCallback(() => {
    api<{ unread: number; items: AppNotification[] }>('/notifications').then(setState, () => undefined);
  }, []);
  useEffect(() => {
    if (!user) return setState({ unread: 0, items: [] });
    load();
    const refresh = () => document.visibilityState === 'visible' && load();
    const id = setInterval(refresh, NOTIFICATIONS_POLL_MS);
    addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(id);
      removeEventListener('visibilitychange', refresh);
    };
  }, [user, load]);

  const markRead = useCallback(
    (id: string) => {
      setState((s) => ({ unread: Math.max(0, s.unread - (s.items.some((n) => n.id === id && !n.read) ? 1 : 0)), items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
      void api(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }).catch(() => undefined);
    },
    [],
  );
  const markAll = useCallback(() => {
    setState((s) => ({ unread: 0, items: s.items.map((n) => ({ ...n, read: true })) }));
    void api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
  }, []);

  useEffect(() => {
    for (const n of state.items) {
      if (n.read || shown.current.has(n.id)) continue;
      shown.current.add(n.id);
      toast(notificationText(n, t), 'accent', { sticky: true, onClose: () => markRead(n.id) });
    }
  }, [state.items, t, toast, markRead]);

  return <NotificationsContext value={{ ...state, markRead, markAll }}>{children}</NotificationsContext>;
}

export const useNotifications = () => useContext(NotificationsContext);

/** Sino ao lado do nome, no topo: contador das não lidas e a lista das últimas. */
export function NotificationBell() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const { unread, items, markRead, markAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent | KeyboardEvent) => {
      if (ev instanceof KeyboardEvent ? ev.key === 'Escape' : !box.current?.contains(ev.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);
  const label = unread > 0 ? t('Notifications ($1 unread)', String(unread)) : t('Notifications');
  return (
    <div className="app-bell" ref={box}>
      <button type="button" className="app-bell-button" aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="app-bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="app-bell-panel" role="dialog" aria-label={t('Notifications')}>
          <div className="app-bell-head">
            <strong>{t('Notifications')}</strong>
            {unread > 0 && (
              <button type="button" className="app-bell-all" onClick={markAll}>
                {t('Mark all as read')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="ui-muted">{t('No notifications.')}</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className={n.read ? undefined : 'unread'}>
                  <button
                    type="button"
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                      void navigate(notificationPath(n));
                    }}
                  >
                    <span>{notificationText(n, t)}</span>
                    <span className="ui-muted">{new Date(n.createdAt).toLocaleDateString(prefs.locale, { day: '2-digit', month: 'short' })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
