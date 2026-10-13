// SPDX-License-Identifier: GPL-2.0-or-later
// Opções na conta (OG-068): ao entrar, as da conta valem (ou, na primeira vez, as do navegador vão
// para a conta); depois, cada mudança do jogador é gravada na conta com 1 s de espera.
import { useEffect, useRef } from 'react';
import { useAccount } from './account.js';
import { api } from './api.js';
import { parsePrefs, usePrefs } from './prefs.js';

const SAVE_DELAY_MS = 1000;

export function PrefsSync() {
  const { user } = useAccount();
  const { prefs, revision, replacePrefs } = usePrefs();
  const loadedFor = useRef<string | null>(null);
  const savedRevision = useRef(revision);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // conta nova na sessão: busca as opções dela
  useEffect(() => {
    if (!user) {
      loadedFor.current = null;
      return;
    }
    if (loadedFor.current === user.id) return;
    let alive = true;
    void api<{ settings: Record<string, unknown> }>('/account/settings').then(
      ({ settings }) => {
        if (!alive) return;
        loadedFor.current = user.id;
        savedRevision.current = revision;
        if (Object.keys(settings).length > 0) replacePrefs(parsePrefs(settings, prefsRef.current));
        else void api('/account/settings', { method: 'PUT', body: { settings: prefsRef.current } }).catch(() => undefined);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // mudanças do jogador (não as que vieram da conta)
  useEffect(() => {
    if (!user || loadedFor.current !== user.id || revision === savedRevision.current) return;
    const id = setTimeout(() => {
      savedRevision.current = revision;
      void api('/account/settings', { method: 'PUT', body: { settings: prefsRef.current } }).catch(() => undefined);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [revision, user]);

  return null;
}
