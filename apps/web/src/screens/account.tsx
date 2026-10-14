// SPDX-License-Identifier: GPL-2.0-or-later
// Telas de conta (OG-081): entrar, criar conta, recuperar e redefinir a senha, conta (troca de senha,
// exportação e exclusão de dados). No design system v2 (OG-202): formulários web de verdade, com
// autocomplete para os gerenciadores de senha e o erro junto do campo.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAccount, type AccountUser } from '../app/account.js';
import { TERMS_VERSION } from '@outgun/content';
import { api, API_URL, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { FieldGroup, TextField, ToggleField } from '../ui/Field.js';
import { MenuList, type MenuListItem } from '../ui/MenuList.js';
import { Form, FormMessageLine, Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';

const MIN_PASSWORD = 8;

/** Campo ao qual a mensagem se refere (fica junto dele); sem campo, vai no pé do formulário. */
type Field = 'invite' | 'username' | 'email' | 'password' | 'confirm' | 'current' | 'clanTag';
type Message = { readonly text: string; readonly error: boolean; readonly field?: Field } | null;

/** Campo de cada erro da API. */
export function errorField(code: string): Field | undefined {
  switch (code) {
    case 'username_taken':
    case 'invalid_username':
    case 'username_cooldown':
      return 'username';
    case 'email_taken':
    case 'invalid_email':
      return 'email';
    case 'invite_required':
    case 'invalid_invite':
      return 'invite';
    case 'invalid_password':
    case 'weak_password':
      return 'password';
    case 'invalid_clan_tag':
      return 'clanTag';
  }
  return undefined;
}

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
      case 'invite_required':
        return t('The closed beta needs an invite code.');
      case 'invalid_invite':
        return t('This invite code is invalid, already used or expired.');
      case 'invalid_password':
        return t('The password must have at least 8 characters.');
      case 'weak_password':
        return t('This password is too common. Choose another.');
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
      const field = error instanceof ApiError ? errorField(error.code) : undefined;
      setMessage({ text: errorText(error), error: true, ...(field ? { field } : {}) });
    } finally {
      setBusy(false);
    }
  };
  /** Erro do campo `field`, para o `error` do `TextField`. */
  const fieldError = (field: Field) => (message?.error && message.field === field ? message.text : undefined);
  /** Mensagem geral (sem campo). */
  const general: Message = message && !message.field ? message : null;
  return { setMessage, busy, run, fieldError, general };
}

export function LoginScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user, setUser } = useAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { setMessage, busy, run, general } = useSubmit();
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
  return (
    <Page title={t('Sign in')} width="narrow" onBack={() => void navigate('/')} backLabel={t('Back')}>
      <Panel>
        <Form
          label={t('Sign in')}
          onSubmit={() => void submit()}
          actions={
            <Button type="submit" variant="primary" block disabled={busy}>
              {t('Sign in')}
            </Button>
          }
        >
          <TextField label={t('Username')} value={username} onChange={setUsername} maxLength={15} autoComplete="username" autoFocus />
          <TextField label={t('Password')} type="password" value={password} onChange={setPassword} maxLength={128} autoComplete="current-password" />
        </Form>
        <FormMessageLine message={general} />
        <div className="ui-links">
          <Link to="/register">{t('Create account')}</Link>
          <Link to="/forgot-password">{t('Forgot your password?')}</Link>
        </div>
      </Panel>
      <Button variant="ghost" onClick={() => void navigate('/play')}>
        {t('Play as guest')}
      </Button>
    </Page>
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
  // beta fechado (OG-106): convite pelo link (/register?invite=CODIGO) ou digitado
  const [invite, setInvite] = useState(() => new URLSearchParams(location.search).get('invite') ?? '');
  const [beta, setBeta] = useState(false);
  // termos de uso e política de privacidade (OG-107): aceite obrigatório, versão vai para a conta
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    api<{ beta: boolean }>('/beta').then(
      (r) => setBeta(r.beta),
      () => {},
    );
  }, []);
  const { setMessage, busy, run, fieldError, general } = useSubmit();
  // Quem chega já logado vai para a conta; quem acabou de entrar aqui segue para o início.
  const [signedIn, setSignedIn] = useState(false);
  if (user && !signedIn) return <Navigate to="/account" replace />;

  const submit = () =>
    run(async () => {
      if (password.length < MIN_PASSWORD) {
        setMessage({ text: t('The password must have at least 8 characters.'), error: true, field: 'password' });
        return;
      }
      if (password !== confirm) {
        setMessage({ text: t('The passwords do not match.'), error: true, field: 'confirm' });
        return;
      }
      if (!accepted) {
        setMessage({ text: t('Accept the terms of use and the privacy policy to create the account.'), error: true });
        return;
      }
      const r = await api<{ user: AccountUser }>('/auth/register', {
        body: { username, email, password, language: prefs.locale, termsVersion: TERMS_VERSION, ...(invite.trim() ? { invite: invite.trim() } : {}) },
      });
      setSignedIn(true);
      setUser(r.user);
      void navigate('/');
    });
  return (
    <Page title={t('Create account')} width="narrow" onBack={() => void navigate('/login')} backLabel={t('Back')}>
      <Panel>
        <Form
          label={t('Create account')}
          onSubmit={() => void submit()}
          actions={
            <Button type="submit" variant="primary" block disabled={busy}>
              {t('Create account')}
            </Button>
          }
        >
          {(beta || invite) && <TextField label={t('Invite code')} value={invite} onChange={setInvite} maxLength={32} error={fieldError('invite')} />}
          <TextField label={t('Username')} value={username} onChange={setUsername} maxLength={15} autoComplete="username" error={fieldError('username')} />
          <TextField label={t('E-mail')} type="email" value={email} onChange={setEmail} maxLength={254} autoComplete="email" hint={t('E-mail (used only to recover your password)')} error={fieldError('email')} />
          <TextField label={t('Password')} type="password" value={password} onChange={setPassword} maxLength={128} autoComplete="new-password" error={fieldError('password')} />
          <TextField label={t('Confirm password')} type="password" value={confirm} onChange={setConfirm} maxLength={128} autoComplete="new-password" error={fieldError('confirm')} />
          <ToggleField
            label={t('I accept the terms of use and the privacy policy')}
            checked={accepted}
            onChange={setAccepted}
            hint={
              <span className="ui-links">
                <a href="/terms" target="_blank">
                  {t('Read the terms of use')}
                </a>
                <a href="/privacy" target="_blank">
                  {t('Read the privacy policy')}
                </a>
              </span>
            }
          />
        </Form>
        <FormMessageLine message={general} />
      </Panel>
    </Page>
  );
}

export function ForgotPasswordScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const { setMessage, busy, run, general } = useSubmit();
  const submit = () =>
    run(async () => {
      if (!login.trim()) return;
      await api('/auth/password/forgot', { body: { login, language: prefs.locale } });
      setMessage({ text: t('If the account exists, a recovery link was sent to its e-mail. The link expires in 30 minutes.'), error: false });
    });
  return (
    <Page title={t('Forgot your password?')} width="narrow" onBack={() => void navigate('/login')} backLabel={t('Back')}>
      <Panel>
        <Form
          label={t('Forgot your password?')}
          onSubmit={() => void submit()}
          actions={
            <Button type="submit" variant="primary" block disabled={busy || !login.trim()}>
              {t('Send recovery link')}
            </Button>
          }
        >
          <TextField label={t('Username or e-mail')} value={login} onChange={setLogin} maxLength={254} autoComplete="username" autoFocus />
        </Form>
        <FormMessageLine message={general} />
      </Panel>
    </Page>
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
  const { setMessage, busy, run, fieldError, general } = useSubmit();
  useEffect(() => {
    if (location.hash) history.replaceState(null, '', location.pathname);
  }, []);

  const submit = () =>
    run(async () => {
      if (password.length < MIN_PASSWORD) {
        setMessage({ text: t('The password must have at least 8 characters.'), error: true, field: 'password' });
        return;
      }
      if (password !== confirm) {
        setMessage({ text: t('The passwords do not match.'), error: true, field: 'confirm' });
        return;
      }
      const r = await api<{ user: AccountUser }>('/auth/password/reset', { body: { token, password } });
      setUser(r.user);
      void navigate('/');
    });
  return (
    <Page title={t('Reset password')} width="narrow" onBack={() => void navigate('/')} backLabel={t('Back')}>
      <Panel>
        <Form
          label={t('Reset password')}
          onSubmit={() => void submit()}
          actions={
            <Button type="submit" variant="primary" block disabled={busy || !token}>
              {t('Save')}
            </Button>
          }
        >
          <TextField label={t('New password')} type="password" value={password} onChange={setPassword} maxLength={128} autoComplete="new-password" error={fieldError('password')} />
          <TextField label={t('Confirm password')} type="password" value={confirm} onChange={setConfirm} maxLength={128} autoComplete="new-password" error={fieldError('confirm')} />
        </Form>
        <FormMessageLine message={token ? general : { text: t('This link is invalid or has expired. Ask for a new one.'), error: true }} />
      </Panel>
    </Page>
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
  const { run, general } = useSubmit();
  // Ao sair por aqui, o destino é o início, não o login.
  const [leaving, setLeaving] = useState(false);
  if (user === null) return leaving ? <Navigate to="/" replace /> : <Navigate to="/login" replace />;
  if (!user) return null;
  const items: MenuListItem[] = [
    { label: t('My profile'), onActivate: () => void navigate(`/players/${encodeURIComponent(user.username)}`) },
    { label: t('Change name'), aside: user.username, onActivate: () => void navigate('/account/username') },
    { label: t('Clan tag'), aside: user.clanTag ?? '—', onActivate: () => void navigate('/account/clan-tag') },
    { label: t('Change password'), onActivate: () => void navigate('/account/password') },
    { label: t('Export my data'), onActivate: () => void run(downloadExport) },
    {
      label: t('Sign out'),
      onActivate: () => {
        setLeaving(true);
        void logout();
      },
    },
    { label: t('Delete account'), aside: <Badge tone="danger">{t('permanent')}</Badge>, onActivate: () => void navigate('/account/delete') },
  ];
  return (
    <Page title={t('Account')} subtitle={`${user.clanTag ? `${user.clanTag} ` : ''}${user.username} · ${user.email}`} width="narrow" onBack={() => void navigate('/')} backLabel={t('Back')}>
      <MenuList label={t('Account')} items={items} autoFocus />
      <FormMessageLine message={general} />
      <PrivacyPanel />
    </Page>
  );
}

/** Privacidade do perfil social (OG-211, D-39): o perfil é público; dá para esconder companheiros e histórico. */
function PrivacyPanel() {
  const { t } = usePrefs();
  const [privacy, setPrivacy] = useState<{ hideCompanions: boolean; hideHistory: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ hideCompanions: boolean; hideHistory: boolean }>('/account/privacy').then(
      (r) => alive && setPrivacy(r),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  const change = (patch: Partial<{ hideCompanions: boolean; hideHistory: boolean }>) => {
    if (!privacy) return;
    const before = privacy;
    const next = { ...privacy, ...patch };
    setPrivacy(next);
    api('/account/privacy', { method: 'PUT', body: next }).catch(() => setPrivacy(before));
  };
  return (
    <Panel title={t('Profile privacy')}>
      <FieldGroup>
        <ToggleField
          label={t('Hide my teammates and rivals')}
          hint={t('You also stop appearing in the lists of other players.')}
          checked={privacy?.hideCompanions ?? false}
          disabled={!privacy}
          onChange={(hideCompanions) => change({ hideCompanions })}
        />
        <ToggleField label={t('Hide my match history')} checked={privacy?.hideHistory ?? false} disabled={!privacy} onChange={(hideHistory) => change({ hideHistory })} />
      </FieldGroup>
    </Panel>
  );
}

/** Formulário de uma tela de conta, com a explicação acima. */
function AccountForm({ title, note, onSubmit, submitLabel, submitDisabled, danger, children, message }: {
  readonly title: string;
  readonly note?: string;
  readonly onSubmit: () => void;
  readonly submitLabel: string;
  readonly submitDisabled?: boolean;
  readonly danger?: boolean;
  readonly children: ReactNode;
  readonly message: Message;
}) {
  const { t } = usePrefs();
  const navigate = useNavigate();
  return (
    <Page title={title} width="narrow" onBack={() => void navigate('/account')} backLabel={t('Back')}>
      <Panel>
        {note && <p className="ui-muted">{note}</p>}
        <Form
          label={title}
          onSubmit={onSubmit}
          actions={
            <Button type="submit" variant={danger ? 'danger' : 'primary'} block disabled={submitDisabled}>
              {submitLabel}
            </Button>
          }
        >
          {children}
        </Form>
        <FormMessageLine message={message} />
      </Panel>
    </Page>
  );
}

export function ChangePasswordScreen() {
  const { t } = usePrefs();
  const { user } = useAccount();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { setMessage, busy, run, fieldError, general } = useSubmit();
  if (user === null) return <Navigate to="/login" replace />;

  const submit = () =>
    run(async () => {
      if (password.length < MIN_PASSWORD) {
        setMessage({ text: t('The password must have at least 8 characters.'), error: true, field: 'password' });
        return;
      }
      if (password !== confirm) {
        setMessage({ text: t('The passwords do not match.'), error: true, field: 'confirm' });
        return;
      }
      try {
        await api('/account/password', { body: { currentPassword: current, newPassword: password } });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'invalid_credentials') {
          setMessage({ text: t('Wrong password.'), error: true, field: 'current' });
          return;
        }
        throw error;
      }
      setCurrent('');
      setPassword('');
      setConfirm('');
      setMessage({ text: t('Password changed. Other sessions were signed out.'), error: false });
    });
  return (
    <AccountForm title={t('Change password')} onSubmit={() => void submit()} submitLabel={t('Save')} submitDisabled={busy} message={general}>
      {/* campo de usuário oculto: os gerenciadores de senha sabem de qual conta é a senha nova */}
      <input type="text" name="username" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
      <TextField label={t('Current password')} type="password" value={current} onChange={setCurrent} maxLength={128} autoComplete="current-password" error={fieldError('current')} />
      <TextField label={t('New password')} type="password" value={password} onChange={setPassword} maxLength={128} autoComplete="new-password" error={fieldError('password')} />
      <TextField label={t('Confirm password')} type="password" value={confirm} onChange={setConfirm} maxLength={128} autoComplete="new-password" error={fieldError('confirm')} />
    </AccountForm>
  );
}

export function DeleteAccountScreen() {
  const { t } = usePrefs();
  const { user, setUser } = useAccount();
  const [password, setPassword] = useState('');
  const { setMessage, busy, run, fieldError, general } = useSubmit();
  const [deleted, setDeleted] = useState(false);
  if (user === null) return deleted ? <Navigate to="/" replace /> : <Navigate to="/login" replace />;

  const submit = () =>
    run(async () => {
      try {
        await api('/account', { method: 'DELETE', body: { password } });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'invalid_credentials') {
          setMessage({ text: t('Wrong password.'), error: true, field: 'password' });
          return;
        }
        throw error;
      }
      setDeleted(true);
      setUser(null);
    });
  return (
    <AccountForm
      title={t('Delete account')}
      note={t('Your account and personal data are erased. Past matches stay, without your name.')}
      onSubmit={() => void submit()}
      submitLabel={t('Delete account permanently')}
      submitDisabled={busy || !password}
      danger
      message={general}
    >
      <TextField label={t('Password')} type="password" value={password} onChange={setPassword} maxLength={128} autoComplete="current-password" error={fieldError('password')} />
    </AccountForm>
  );
}

/** Troca do nome de usuário (OG-082): uma vez a cada 30 dias; o antigo fica reservado por 90. */
export function ChangeUsernameScreen() {
  const { t } = usePrefs();
  const { user, setUser } = useAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { setMessage, busy, run, fieldError, general } = useSubmit();
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
          setMessage({ text: t('Wrong password.'), error: true, field: 'password' });
          return;
        }
        throw error;
      }
    });
  return (
    <AccountForm
      title={t('Change name')}
      note={t('Once every 30 days. Your old name stays reserved for you for 90 days.')}
      onSubmit={() => void submit()}
      submitLabel={t('Save')}
      submitDisabled={busy || !username || !password}
      message={general}
    >
      <TextField label={t('New name')} value={username} onChange={setUsername} maxLength={15} autoComplete="off" error={fieldError('username')} />
      <TextField label={t('Password')} type="password" value={password} onChange={setPassword} maxLength={128} autoComplete="current-password" error={fieldError('password')} />
    </AccountForm>
  );
}

/** Clan tag (OG-082): aparece como "(TAG) nome" no chat. */
export function ClanTagScreen() {
  const { t } = usePrefs();
  const { user, setUser } = useAccount();
  const [tag, setTag] = useState(user?.clanTag ?? '');
  const { setMessage, busy, run, fieldError, general } = useSubmit();
  if (user === null) return <Navigate to="/login" replace />;

  const save = (clanTag: string | null) =>
    run(async () => {
      const r = await api<{ user: AccountUser }>('/account/clan-tag', { method: 'PUT', body: { clanTag } });
      setUser(r.user);
      setTag(r.user.clanTag ?? '');
      setMessage({ text: t('Saved.'), error: false });
    });
  return (
    <AccountForm title={t('Clan tag')} note={t('Shown in chat as "(TAG) name".')} onSubmit={() => void save(tag || null)} submitLabel={t('Save')} submitDisabled={busy} message={general}>
      <TextField label={t('Clan tag')} value={tag} onChange={setTag} maxLength={6} error={fieldError('clanTag')} />
      {user?.clanTag && (
        <Button variant="ghost" onClick={() => void save(null)}>
          {t('Remove clan tag')}
        </Button>
      )}
    </AccountForm>
  );
}
