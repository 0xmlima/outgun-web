// SPDX-License-Identifier: GPL-2.0-or-later
// Conta do jogador (OG-081): quem está logado, segundo o cookie de sessão da API.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api.js';

export interface AccountUser {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly clanTag: string | null;
  readonly isAdmin: boolean;
}

interface AccountContextValue {
  /** undefined = ainda consultando; null = convidado. */
  readonly user: AccountUser | null | undefined;
  readonly setUser: (user: AccountUser | null) => void;
  readonly logout: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    api<{ user: AccountUser }>('/auth/me').then(
      (r) => alive && setUser(r.user),
      // Sem API no ar (jogo só com o servidor de jogo) também conta como convidado.
      () => alive && setUser(null),
    );
    return () => {
      alive = false;
    };
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);
  const value = useMemo(() => ({ user, setUser, logout }), [user, logout]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount fora do AccountProvider');
  return value;
}
