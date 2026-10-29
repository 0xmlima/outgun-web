// SPDX-License-Identifier: GPL-2.0-or-later
// Notificações da conta (OG-361): o sino no topo do site com as não lidas e a lista, e um aviso fixo
// (toast, à direita) para cada não lida que chega; fechar o aviso marca a notificação como lida.
// Marcos novos de uma partida (OG-394) chegam pelo mesmo caminho, fora da partida (só no Shell).
import { MILESTONES, type Bilingual } from '@outgun/content';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useAccount } from './account.js';
import { api } from './api.js';
import { desktopBridge, syncSteamAchievements } from './install.js';
import { usePrefs } from './prefs.js';
import { Icon } from '../ui/icons.js';
import { useToast } from '../ui/Toast.js';
import { fallbackMs, reconnectLive, useLive, useLiveConnected } from './live.js';

/** Releitura das notificações enquanto a aba está visível. */
export const NOTIFICATIONS_POLL_MS = 30_000;

export interface AppNotification {
  id: string;
  kind: 'clan_invite' | 'clan_request' | 'milestone' | 'number_expiring' | 'number_released' | 'cup';
  data: {
    clanTag?: string;
    clanName?: string;
    from?: string;
    milestones?: string[];
    secretNames?: Record<string, Bilingual>;
    number?: number;
    /** OutCup (OG-527). */
    cup?: string;
    cupEvent?: string;
    partner?: string;
    opponent?: string;
    matchId?: string;
    at?: string;
    won?: boolean;
    bye?: boolean;
    resolution?: string;
  };
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

/** Marcos mostrados pelo nome no aviso; o resto vira "+N". */
export const MILESTONE_NAMES_SHOWN = 3;

/** Texto da notificação. */
export function notificationText(n: AppNotification, t: T, locale = 'en'): string {
  if (n.kind === 'milestone') {
    const l = locale === 'pt-BR' ? 'pt-BR' : 'en';
    const ids = n.data.milestones ?? [];
    const names = ids.map((id) => n.data.secretNames?.[id]?.[l] ?? MILESTONES.find((m) => m.id === id)?.name[l] ?? id);
    const shown = names.slice(0, MILESTONE_NAMES_SHOWN).join(', ') + (names.length > MILESTONE_NAMES_SHOWN ? ` +${names.length - MILESTONE_NAMES_SHOWN}` : '');
    const secret = ids.some((id) => n.data.secretNames?.[id]);
    return secret ? t('Secret milestone unlocked! $1', shown) : names.length === 1 ? t('New milestone: $1', shown) : t('New milestones: $1', shown);
  }
  if (n.kind === 'cup') return cupNotificationText(n, t, locale);
  // número de jogador (OG-410)
  if (n.kind === 'number_expiring') return t('Your number $1 is freed in 7 days if you do not play.', String(n.data.number ?? '?'));
  if (n.kind === 'number_released') return t('Your number $1 was freed after 60 days without playing.', String(n.data.number ?? '?'));
  const clan = n.data.clanTag ? `(${n.data.clanTag}) ${n.data.clanName ?? ''}`.trim() : '';
  return n.kind === 'clan_invite' ? t('$1 invited you to the clan $2', n.data.from ?? '?', clan) : t('$1 asked to join $2', n.data.from ?? '?', clan);
}

/** Aviso da OutCup (OG-527): o que aconteceu, com o adversário e o horário quando houver. */
function cupNotificationText(n: AppNotification, t: T, locale: string): string {
  const d = n.data;
  const at = d.at ? new Date(d.at).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  switch (d.cupEvent) {
    case 'registration_open':
      return t('OutCup sign-ups are open.');
    case 'drawn':
      return d.bye ? t('OutCup: your pair skips the first round.') : d.partner ? t('OutCup: you play with $1 against $2.', d.partner, d.opponent ?? '?') : t('OutCup: your next opponent is $1.', d.opponent ?? '?');
    case 'left_out':
      return t('OutCup: you were left out of the draw (odd number of sign-ups).');
    case 'cancelled':
      return t('OutCup: this edition was cancelled.');
    case 'proposed':
      return t('OutCup: $1 proposed $2.', d.opponent ?? '?', at);
    case 'declined':
      return t('OutCup: $1 declined the proposed time.', d.opponent ?? '?');
    case 'scheduled':
      return t('OutCup: match against $1 scheduled for $2.', d.opponent ?? '?', at);
    case 'room_open':
      return t('OutCup: the room for your match is open.');
    case 'deadline':
      return t('OutCup: the round window ends on $1 and your match is not scheduled.', at);
    case 'result':
      return d.won ? t('OutCup: your pair moves on!') : d.resolution === 'double_walkover' ? t('OutCup: both pairs are out by walkover.') : t('OutCup: $1 won the match.', d.opponent ?? '?');
    case 'champion':
      return t('OutCup: $1 won the cup!', d.opponent ?? '?');
    default:
      return 'OutCup';
  }
}

/** Para onde a notificação leva: a caixa de convites ou a página do clã (onde a liderança aprova). */
export const notificationPath = (n: AppNotification, username?: string) =>
  n.kind === 'cup'
    ? `/outcup${n.data.cup ? `/${n.data.cup}` : ''}${n.data.matchId ? `?confronto=${n.data.matchId}` : ''}`
    : n.kind === 'milestone' ? (username ? `/players/${encodeURIComponent(username)}` : '/') : n.kind === 'number_expiring' || n.kind === 'number_released' ? '/account' : n.kind === 'clan_invite' || !n.data.clanTag ? '/clans/inbox' : `/clans/${encodeURIComponent(n.data.clanTag)}`;

export function NotificationsProvider({ children }: { readonly children: ReactNode }) {
  const { t, prefs } = usePrefs();
  const { user } = useAccount();
  const toast = useToast();
  const [state, setState] = useState<{ unread: number; items: AppNotification[] }>({ unread: 0, items: [] });
  // avisos já mostrados nesta sessão: a mesma notificação não volta a cada releitura
  const shown = useRef(new Set<string>());

  // conquistas da Steam (OG-396): ao entrar, todos os marcos da conta (o retroativo sai de graça)
  useEffect(() => {
    if (!user || !desktopBridge()?.steamAvailable?.()) return;
    api<{ milestones: { id: string }[] }>(`/players/${encodeURIComponent(user.username)}`).then(
      (p) => syncSteamAchievements(p.milestones.map((m) => m.id)),
      () => undefined,
    );
  }, [user]);

  const load = useCallback(() => {
    api<{ unread: number; items: AppNotification[] }>('/notifications').then(setState, () => undefined);
  }, []);
  // portal ao vivo (OG-284): notificação nova chega na hora; a consulta fica de reserva
  useLive(user ? 'notifications' : null, load);
  const every = fallbackMs(NOTIFICATIONS_POLL_MS, useLiveConnected());
  // o canal sabe de quem são as notificações pela sessão: troca de conta reabre
  useEffect(() => reconnectLive(), [user?.username]);
  useEffect(() => {
    if (!user) return setState({ unread: 0, items: [] });
    load();
    const refresh = () => document.visibilityState === 'visible' && load();
    const id = setInterval(refresh, every);
    addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(id);
      removeEventListener('visibilitychange', refresh);
    };
  }, [user, load, every]);

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
      // marco novo: aviso que some sozinho e já conta como lido (fica no sino); o resto espera fechar
      if (n.kind === 'milestone') {
        toast(notificationText(n, t, prefs.locale), 'accent');
        syncSteamAchievements(n.data.milestones ?? []);
        markRead(n.id);
      } else toast(notificationText(n, t, prefs.locale), 'accent', { sticky: true, onClose: () => markRead(n.id) });
    }
  }, [state.items, t, prefs.locale, toast, markRead]);

  return <NotificationsContext value={{ ...state, markRead, markAll }}>{children}</NotificationsContext>;
}

export const useNotifications = () => useContext(NotificationsContext);

/** Sino ao lado do nome, no topo: contador das não lidas e a lista das últimas. */
export function NotificationBell() {
  const { t, prefs } = usePrefs();
  const { user } = useAccount();
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
                      void navigate(notificationPath(n, user?.username));
                    }}
                  >
                    <span>{notificationText(n, t, prefs.locale)}</span>
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
