// SPDX-License-Identifier: GPL-2.0-or-later
// Erros do cliente para o serviço de erros (OG-102), só com VITE_SENTRY_DSN no build. Vai a
// mensagem, a pilha, a rota e de onde se joga (navegador ou app desktop/Steam, OG-434); nada do
// jogador (nome, conta) sai daqui.
import { ErrorReporter, type ErrorContext } from '@outgun/observability/errors';
import { browserName } from '../game/net/telemetry.js';
import { isDesktopClient } from './install.js';

let reporter: ErrorReporter | null = null;

const tags = (): Record<string, string> => ({
  route: location.pathname,
  client: isDesktopClient() ? 'desktop' : 'browser',
  browser: browserName(navigator.userAgent),
});

export function installErrorReporting(): ErrorReporter {
  reporter = new ErrorReporter({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    service: 'web',
    platform: 'javascript',
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE,
    perMinute: 10,
  });
  if (!reporter.enabled) return reporter;
  const r = reporter;
  window.addEventListener('error', (e) => r.capture(e.error ?? e.message, { tags: tags() }));
  window.addEventListener('unhandledrejection', (e) => r.capture(e.reason, { tags: tags() }));
  return reporter;
}

/** Erro já tratado (não chega ao `window.onerror`), com marcas próprias; ex.: `{ area: 'render' }`. */
export function captureError(error: unknown, context: ErrorContext = {}): void {
  reporter?.capture(error, { ...context, tags: { ...tags(), ...context.tags } });
}
