// SPDX-License-Identifier: GPL-2.0-or-later
// "Jogar agora" (RN-UI-04): a um clique da tela inicial e da barra superior (OG-201).
import { useNavigate } from 'react-router';
import { quickJoin } from '../screens/lobby.js';
import { ApiError } from './api.js';
import { usePrefs } from './prefs.js';

/** Entra numa sala Casual escolhida pela API (OG-069); sem a API (desenvolvimento), na sala principal. */
export function usePlayNow(): () => void {
  const { prefs } = usePrefs();
  const navigate = useNavigate();
  return () =>
    void quickJoin('casual', prefs.playerName.trim() || 'Convidado').then(
      (id) => void navigate(`/play?sala=${encodeURIComponent(id)}`),
      // beta fechado (OG-106): sem conta, vai para o login
      (e: unknown) => void navigate(e instanceof ApiError && e.code === 'beta_account_required' ? '/login' : '/play'),
    );
}
