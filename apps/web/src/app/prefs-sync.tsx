// SPDX-License-Identifier: GPL-2.0-or-later
// Opções na conta (OG-068): ao entrar, as da conta valem (ou, na primeira vez, as do navegador vão
// para a conta); depois, cada mudança do jogador é gravada na conta com 1 s de espera. O envio pendente
// sai ao fechar a página, e o estado do salvamento aparece nas Opções (OG-285).
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAccount } from './account.js';
import { api } from './api.js';
import { parsePrefs, type Prefs, usePrefs } from './prefs.js';

const SAVE_DELAY_MS = 1000;

/** Salvamento na conta: `idle` = nada pendente desde que a tela abriu. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

let status: SaveStatus = 'idle';
const listeners = new Set<() => void>();

function setStatus(next: SaveStatus): void {
  if (next === status) return;
  status = next;
  for (const l of [...listeners]) l();
}

/** Estado do salvamento das opções na conta. */
export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

function put(settings: Prefs, keepalive = false): Promise<unknown> {
  return api('/account/settings', { method: 'PUT', body: { settings }, keepalive });
}

export function PrefsSync() {
  const { user } = useAccount();
  const { prefs, revision, replacePrefs } = usePrefs();
  const loadedFor = useRef<string | null>(null);
  const savedRevision = useRef(revision);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  // conta nova na sessão: busca as opções dela
  useEffect(() => {
    if (!user) {
      loadedFor.current = null;
      setStatus('idle');
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
        else void put(prefsRef.current).catch(() => undefined);
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
    setStatus('saving');
    const save = (keepalive: boolean) => {
      savedRevision.current = revision;
      put(prefsRef.current, keepalive).then(
        () => revisionRef.current === revision && setStatus('saved'),
        () => setStatus('error'),
      );
    };
    const id = setTimeout(() => save(false), SAVE_DELAY_MS);
    // fechar ou recarregar a página antes do envio não perde a mudança
    const flush = () => {
      clearTimeout(id);
      if (savedRevision.current !== revision) save(true);
    };
    addEventListener('pagehide', flush);
    return () => {
      clearTimeout(id);
      removeEventListener('pagehide', flush);
    };
  }, [revision, user]);

  return null;
}
