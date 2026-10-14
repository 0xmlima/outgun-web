// SPDX-License-Identifier: GPL-2.0-or-later
// Erros do cliente para o serviço de erros (OG-102), só com VITE_SENTRY_DSN no build. Vai a
// mensagem, a pilha e a rota; nada do jogador (nome, conta) sai daqui.
import { ErrorReporter } from '@outgun/observability/errors';

export function installErrorReporting(): ErrorReporter {
  const reporter = new ErrorReporter({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    service: 'web',
    platform: 'javascript',
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE,
    perMinute: 10,
  });
  if (!reporter.enabled) return reporter;
  const tags = () => ({ route: location.pathname });
  window.addEventListener('error', (e) => reporter.capture(e.error ?? e.message, { tags: tags() }));
  window.addEventListener('unhandledrejection', (e) => reporter.capture(e.reason, { tags: tags() }));
  return reporter;
}
