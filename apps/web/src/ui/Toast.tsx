// SPDX-License-Identifier: GPL-2.0-or-later
// Avisos passageiros do design system v2 (OG-200): `useToast()(mensagem)` mostra um aviso no canto,
// anunciado pelos leitores de tela, que some sozinho; no máximo três na tela.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Tone } from './Button.js';

export interface ToastItem {
  readonly id: number;
  readonly message: ReactNode;
  readonly tone: Tone;
}

export const MAX_TOASTS = 3;
export const TOAST_MS = 4000;

/** Fila de avisos: o novo entra no fim e os mais antigos saem além de `MAX_TOASTS`. */
export function pushToast(list: readonly ToastItem[], item: ToastItem): ToastItem[] {
  return [...list, item].slice(-MAX_TOASTS);
}

type ShowToast = (message: ReactNode, tone?: Tone) => void;

const ToastContext = createContext<ShowToast | null>(null);

let nextId = 1;

export function ToastProvider({ children, closeLabel }: { readonly children: ReactNode; readonly closeLabel: string }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback<ShowToast>(
    (message, tone = 'neutral') => {
      const id = nextId++;
      setToasts((list) => pushToast(list, { id, message, tone }));
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );
  return (
    <ToastContext value={show}>
      {children}
      {/* só aria-live (sem role="status"): a região vazia não concorre com o status de cada tela */}
      <div className="ui-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ui-toast ui-tone-${t.tone}`}>
            <span>{t.message}</span>
            <button type="button" className="ui-toast-close" aria-label={closeLabel} onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast fora de ToastProvider');
  return show;
}
