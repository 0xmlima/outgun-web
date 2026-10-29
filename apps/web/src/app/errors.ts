// SPDX-License-Identifier: GPL-2.0-or-later
// Erros do cliente para o serviço de erros (OG-102), só com VITE_SENTRY_DSN no build. Vai a
// mensagem, a pilha, a rota e de onde se joga (navegador ou app desktop/Steam, OG-434); nada do
// jogador (nome, conta) sai daqui.
import { ErrorReporter, parseStack, type ErrorContext } from '@outgun/observability/errors';
import { browserName } from '../game/net/telemetry.js';
import { isDesktopClient } from './install.js';

let reporter: ErrorReporter | null = null;

const tags = (): Record<string, string> => ({
  route: location.pathname,
  client: isDesktopClient() ? 'desktop' : 'browser',
  browser: browserName(navigator.userAgent),
});

/**
 * O erro tem pilha e nenhum quadro é nosso (`/assets/` do build, `/src/` ou `/@` do Vite em dev)?
 * É script injetado pelo navegador ou por um app (tradutor, webview): não vai ao Sentry (OG-510,
 * OUTGUN-WEB-5). Sem pilha, vai (não dá para saber).
 */
export function foreignError(error: unknown, origin = location.origin): boolean {
  const frames = error instanceof Error ? parseStack(error.stack) : [];
  if (!frames.length) return false;
  return !frames.some(({ filename }) => filename.startsWith(origin) && /\/(assets|src|@[\w-]+|node_modules)\//.test(filename.slice(origin.length)));
}

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
  window.addEventListener('error', (e) => !foreignError(e.error) && r.capture(e.error ?? e.message, { tags: tags() }));
  window.addEventListener('unhandledrejection', (e) => !foreignError(e.reason) && r.capture(e.reason, { tags: tags() }));
  return reporter;
}

/** Erro já tratado (não chega ao `window.onerror`), com marcas próprias; ex.: `{ area: 'render' }`. */
export function captureError(error: unknown, context: ErrorContext = {}): void {
  reporter?.capture(error, { ...context, tags: { ...tags(), ...context.tags } });
}
