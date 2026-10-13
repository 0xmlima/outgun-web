// SPDX-License-Identifier: GPL-2.0-or-later
// Telas de conta (OG-081): entrar, criar conta, recuperar e redefinir a senha, conta (troca de senha,
// exportação e exclusão de dados). Todas no estilo dos menus do original.
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAccount, type AccountUser } from '../app/account.js';
import { api, API_URL, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { BitmapText } from '../ui/BitmapText.js';
import { Menu, type MenuItem } from '../ui/Menu.js';

const MIN_PASSWORD = 8;

type Message = { readonly text: string; readonly error: boolean } | null;

function useErrorText(): (error: unknown) => string {
  const { t } = usePrefs();
  return (error) => {
    const code = error instanceof ApiError ? error.code : 'unknown';
    switch (code) {
      case 'invalid_credentials':
        return t('Invalid username or password.');
      case 'too_many_attempts':
        return t('Too many attempts. Wait $1 seconds and try again.', String((error as ApiError).retryAfter ?? 30));
      case 'username_taken':
        return t('This username is already taken.');
      case 'email_taken':
        return t('This e-mail is already in use. Forgot your password?');
      case 'invalid_username':
        return t('Invalid username: up to 15 characters, no spaces at the ends.');
      case 'invalid_email':
        return t('Invalid e-mail.');
      case 'invalid_password':
        return t('The password must have at least 8 characters.');
      case 'username_cooldown':
        return t('You can change your name again on $1.', new Date((error as ApiError).message).toLocaleDateString());
      case 'invalid_clan_tag':
        return t('Invalid clan tag: 1 to 6 characters, no parentheses.');
      case 'invalid_token':
        return t('This link is invalid or has expired. Ask for a new one.');
      case 'rate_limited':
        return t('Too many requests. Try again later.');
      case 'network':
        return t('Could not reach the server.');
      default:
        return t('Something went wrong. Try again.');
    }
  };
}

function MessageLine({ message }: { readonly message: Message }) {
  if (!message) return null;
  return (
    <p className={message.error ? 'menu-message error' : 'menu-message'} role={message.error ? 'alert' : 'status'}>
      <BitmapText text={message.text} />
    </p>
  );
}

/** Estado comum: mensagem e "enviando" (ignora Enter repetido). */
function useSubmit() {
  const errorText = useErrorText();
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (error) {
      setMessage({ text: errorText(error), error: true });
    } finally {
      setBusy(false);
    }
  };
  return { message, setMessage, busy, run };
}

export function LoginScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user, setUser } = useAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { message, setMessage, run } = useSubmit();
  // Quem chega já logado vai para a conta; quem acabou de entrar aqui segue para o início.
  const [signedIn, setSignedIn] = useState(false);
  if (user && !signedIn) return <Navigate to="/account" replace />;

  const submit = () =>
    run(async () => {
      if (!username.trim() || !password) {
        setMessage({ text: t('Invalid username or password.'), error: true });
        return;
      }
      const r = await api<{ user: AccountUser }>('/auth/login', { body: { username, password } });
      setSignedIn(true);
      setUser(r.user);
      void navigate('/');
    });
  const items: MenuItem[] = [
    { kind: 'action', label: t('Play as guest'), onActivate: () => void navigate('/play') },
    { kind: 'text', label: t('Username'), value: username, onChange: setUsername, maxLength: 15, autoComplete: 'username' },
    {
      kind: 'text',
      label: t('Password'),
      value: password,
      onChange: setPassword,
      password: true,
      maxLength: 128,
      autoComplete: 'current-password',
      onEnter: () => void submit(),
    },
    { kind: 'action', label: t('Sign in'), onActivate: () => void submit() },
    { kind: 'action', label: t('Create account'), onActivate: () => void navigate('/register') },
    { kind: 'action', label: t('Forgot your password?'), onActivate: () => void navigate('/forgot-password') },
  ];
  return (
    <Menu caption={t('Sign in')} items={items} onBack={() => void navigate('/')}>
      <MessageLine message={message} />
    </Menu>
  );
}

export function RegisterScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const { user, setUser } = useAccount();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { message, setMessage, run } = useSubmit();
  // Quem chega já logado vai para a conta; quem acabou de entrar aqui segue para o início.
  const [signedIn, setSignedIn] = useState(false);
  if (user && !signedIn) return <Navigate to="/account" replace />;

  const submit = () =>
    run(async () => {
      if (password.length < MIN_PASSWORD) {
        setMessage({ text: t('The password must have at least 8 characters.'), error: true });
        return;
      }
      if (password !== confirm) {
        setMessage({ text: t('The passwords do not match.'), error: true });
        return;
      }
      const r = await api<{ user: AccountUser }>('/auth/register', {
        body: { username, email, password, language: prefs.locale },
      });
      setSignedIn(true);
      setUser(r.user);
      void navigate('/');
    });
  const items: MenuItem[] = [
    { kind: 'text', label: t('Username'), value: username, onChange: setUsername, maxLength: 15, autoComplete: 'username' },
    { kind: 'text', label: t('E-mail'), value: email, onChange: setEmail, maxLength: 254, autoComplete: 'email' },
    { kind: 'text', label: t('Password'), value: password, onChange: setPassword, password: true, maxLength: 128, autoComplete: 'new-password' },
    {
      kind: 'text',
      label: t('Confirm password'),
      value: confirm,
      onChange: setConfirm,
      password: true,
      maxLength: 128,
      autoComplete: 'new-password',
      onEnter: () => void submit(),
    },
    { kind: 'action', label: t('Create account'), onActivate: () => void submit() },
  ];
  return (
    <Menu caption={t('Create account')} items={items} onBack={() => void navigate('/login')}>
      <p className="menu-message">
        <BitmapText text={t('E-mail (used only to recover your password)')} />
      </p>
      <MessageLine message={message} />
    </Menu>
  );
}

export function ForgotPasswordScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const { message, setMessage, run } = useSubmit();
  const submit = () =>
    run(async () => {
      if (!login.trim()) return;
      await api('/auth/password/forgot', { body: { login, language: prefs.locale } });
      setMessage({ text: t('If the account exists, a recovery link was sent to its e-mail. The link expires in 30 minutes.'), error: false });
    });
  const items: MenuItem[] = [
    {
      kind: 'text',
      label: t('Username or e-mail'),
      value: login,
      onChange: setLogin,
      maxLength: 254,
      autoComplete: 'username',
      onEnter: () => void submit(),
    },
    { kind: 'action', label: t('Send recovery link'), onActivate: () => void submit() },
  ];
  return (
    <Menu caption={t('Forgot your password?')} items={items} onBack={() => void navigate('/login')}>
      <MessageLine message={message} />
    </Menu>
  );
}

/** Link do e-mail: /reset-password#token=... (o token fica no fragmento, fora dos logs do servidor). */
export function ResetPasswordScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { setUser } = useAccount();
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { message, setMessage, run } = useSubmit();
  useEffect(() => {
    if (location.hash) history.replaceState(null, '', location.pathname);
  }, []);

  const submit = () =>
    run(async () => {
      if (password.length < MIN_PASSWORD) {
        setMessage({ text: t('The password must have at least 8 characters.'), error: true });
        return;
      }
      if (password !== confirm) {
        setMessage({ text: t('The passwords do not match.'), error: true });
        return;
      }
      const r = await api<{ user: AccountUser }>('/auth/password/reset', { body: { token, password } });
      setUser(r.user);
      void navigate('/');
    });
  const items: MenuItem[] = [
    { kind: 'text', label: t('New password'), value: password, onChange: setPassword, password: true, maxLength: 128, autoComplete: 'new-password' },
    {
      kind: 'text',
      label: t('Confirm password'),
      value: confirm,
      onChange: setConfirm,
      password: true,
      maxLength: 128,
      autoComplete: 'new-password',
      onEnter: () => void submit(),
    },
    { kind: 'action', label: t('Save'), onActivate: () => void submit(), disabled: !token },
  ];
  return (
    <Menu caption={t('Reset password')} items={items} onBack={() => void navigate('/')}>
      <MessageLine message={token ? message : { text: t('This link is invalid or has expired. Ask for a new one.'), error: true }} />
    </Menu>
  );
}

async function downloadExport(): Promise<void> {
  const res = await fetch(`${API_URL}/account/export`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'unknown', res.statusText);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'outgun-account.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AccountScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user, logout } = useAccount();
  const { message, run } = useSubmit();
  // Ao sair por aqui, o destino é o início, não o login.
  const [leaving, setLeaving] = useState(false);
  if (user === null) return leaving ? <Navigate to="/" replace /> : <Navigate to="/login" replace />;
  if (!user) return null;
  const items: MenuItem[] = [
    { kind: 'action', label: t('Change name'), note: user.username, onActivate: () => void navigate('/account/username') },
    { kind: 'action', label: t('Clan tag'), note: user.clanTag ?? '-', onActivate: () => void navigate('/account/clan-tag') },
    { kind: 'choice', label: t('E-mail'), value: user.email, onChange: () => {}, disabled: true },
    { kind: 'action', label: t('Change password'), onActivate: () => void navigate('/account/password') },
    { kind: 'action', label: t('Export my data'), onActivate: () => void run(downloadExport) },
    {
      kind: 'action',
      label: t('Sign out'),
      onActivate: () => {
        setLeaving(true);
        void logout();
      },
    },
    { kind: 'action', label: t('Delete account'), onActivate: () => void navigate('/account/delete') },
  ];
  return (
    <Menu caption={t('Account')} items={items} onBack={() => void navigate('/')}>
      <MessageLine message={message} />
    </Menu>
  );
}

export function ChangePasswordScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user } = useAccount();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { message, setMessage, run } = useSubmit();
  if (user === null) return <Navigate to="/login" replace />;

  const submit = () =>
    run(async () => {
      if (password.length < MIN_PASSWORD) {
        setMessage({ text: t('The password must have at least 8 characters.'), error: true });
        return;
      }
      if (password !== confirm) {
        setMessage({ text: t('The passwords do not match.'), error: true });
        return;
      }
      try {
        await api('/account/password', { body: { currentPassword: current, newPassword: password } });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'invalid_credentials') {
          setMessage({ text: t('Wrong password.'), error: true });
          return;
        }
        throw error;
      }
      setCurrent('');
      setPassword('');
      setConfirm('');
      setMessage({ text: t('Password changed. Other sessions were signed out.'), error: false });
    });
  const items: MenuItem[] = [
    { kind: 'text', label: t('Current password'), value: current, onChange: setCurrent, password: true, maxLength: 128, autoComplete: 'current-password' },
    { kind: 'text', label: t('New password'), value: password, onChange: setPassword, password: true, maxLength: 128, autoComplete: 'new-password' },
    {
      kind: 'text',
      label: t('Confirm password'),
      value: confirm,
      onChange: setConfirm,
      password: true,
      maxLength: 128,
      autoComplete: 'new-password',
      onEnter: () => void submit(),
    },
    { kind: 'action', label: t('Save'), onActivate: () => void submit() },
  ];
  return (
    <Menu caption={t('Change password')} items={items} onBack={() => void navigate('/account')}>
      <MessageLine message={message} />
    </Menu>
  );
}

export function DeleteAccountScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user, setUser } = useAccount();
  const [password, setPassword] = useState('');
  const { message, setMessage, run } = useSubmit();
  const [deleted, setDeleted] = useState(false);
  if (user === null) return deleted ? <Navigate to="/" replace /> : <Navigate to="/login" replace />;

  const submit = () =>
    run(async () => {
      try {
        await api('/account', { method: 'DELETE', body: { password } });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'invalid_credentials') {
          setMessage({ text: t('Wrong password.'), error: true });
          return;
        }
        throw error;
      }
      setDeleted(true);
      setUser(null);
    });
  const items: MenuItem[] = [
    {
      kind: 'text',
      label: t('Password'),
      value: password,
      onChange: setPassword,
      password: true,
      maxLength: 128,
      autoComplete: 'current-password',
    },
    { kind: 'action', label: t('Delete account permanently'), onActivate: () => void submit(), disabled: !password },
  ];
  return (
    <Menu caption={t('Delete account')} items={items} onBack={() => void navigate('/account')}>
      <p className="menu-message">
        <BitmapText text={t('Your account and personal data are erased. Past matches stay, without your name.')} />
      </p>
      <MessageLine message={message} />
    </Menu>
  );
}

/** Troca do nome de usuário (OG-082): uma vez a cada 30 dias; o antigo fica reservado por 90. */
export function ChangeUsernameScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user, setUser } = useAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { message, setMessage, run } = useSubmit();
  if (user === null) return <Navigate to="/login" replace />;

  const submit = () =>
    run(async () => {
      try {
        const r = await api<{ user: AccountUser }>('/account/username', { body: { username, password } });
        setUser(r.user);
        setPassword('');
        setMessage({ text: t('Name changed to $1.', r.user.username), error: false });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'invalid_credentials') {
          setMessage({ text: t('Wrong password.'), error: true });
          return;
        }
        throw error;
      }
    });
  const items: MenuItem[] = [
    { kind: 'text', label: t('New name'), value: username, onChange: setUsername, maxLength: 15, autoComplete: 'off' },
    {
      kind: 'text',
      label: t('Password'),
      value: password,
      onChange: setPassword,
      password: true,
      maxLength: 128,
      autoComplete: 'current-password',
      onEnter: () => void submit(),
    },
    { kind: 'action', label: t('Save'), onActivate: () => void submit(), disabled: !username || !password },
  ];
  return (
    <Menu caption={t('Change name')} items={items} onBack={() => void navigate('/account')}>
      <p className="menu-message">
        <BitmapText text={t('Once every 30 days. Your old name stays reserved for you for 90 days.')} />
      </p>
      <MessageLine message={message} />
    </Menu>
  );
}

/** Clan tag (OG-082): aparece como "(TAG) nome" no chat. */
export function ClanTagScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user, setUser } = useAccount();
  const [tag, setTag] = useState(user?.clanTag ?? '');
  const { message, setMessage, run } = useSubmit();
  if (user === null) return <Navigate to="/login" replace />;

  const save = (clanTag: string | null) =>
    run(async () => {
      const r = await api<{ user: AccountUser }>('/account/clan-tag', { method: 'PUT', body: { clanTag } });
      setUser(r.user);
      setTag(r.user.clanTag ?? '');
      setMessage({ text: t('Saved.'), error: false });
    });
  const items: MenuItem[] = [
    { kind: 'text', label: t('Clan tag'), value: tag, onChange: setTag, maxLength: 6, onEnter: () => void save(tag || null) },
    { kind: 'action', label: t('Save'), onActivate: () => void save(tag || null) },
    { kind: 'action', label: t('Remove clan tag'), onActivate: () => void save(null), disabled: !user?.clanTag },
  ];
  return (
    <Menu caption={t('Clan tag')} items={items} onBack={() => void navigate('/account')}>
      <p className="menu-message">
        <BitmapText text={t('Shown in chat as "(TAG) name".')} />
      </p>
      <MessageLine message={message} />
    </Menu>
  );
}
