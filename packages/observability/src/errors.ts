// SPDX-License-Identifier: GPL-2.0-or-later
// Envio de erros a um serviço compatível com o protocolo do Sentry (Sentry, GlitchTip): um POST de
// "envelope" por erro, com a pilha já separada em quadros. Sem DSN, nada é enviado. Funciona no
// navegador e no Node (só usa `fetch`), sem o SDK oficial: o cliente web não carrega nada a mais e o
// game server não ganha instrumentação automática em volta do uWebSockets.js (D-32).

export interface ErrorReporterConfig {
  /** `https://CHAVE@host/ID_DO_PROJETO`; vazio desliga. */
  dsn?: string | undefined;
  service: string;
  environment?: string | undefined;
  release?: string | undefined;
  platform?: 'node' | 'javascript';
  /** Máximo de envios por minuto (o resto é descartado). */
  perMinute?: number;
  /** Substitui `fetch` (testes). */
  fetch?: typeof fetch;
  now?: () => number;
}

export interface ErrorContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: 'fatal' | 'error' | 'warning';
}

export interface ParsedDsn {
  url: string;
  publicKey: string;
}

export function parseDsn(dsn: string): ParsedDsn | null {
  const m = /^(https?):\/\/([^:@/]+)(?::[^@/]*)?@([^/]+)(\/.*)?\/(\d+)\/?$/.exec(dsn.trim());
  if (!m) return null;
  const [, scheme, key, host, path = '', project] = m;
  return { url: `${scheme}://${host}${path}/api/${project}/envelope/`, publicKey: key as string };
}

export interface StackFrame {
  function?: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

/** Quadros de uma pilha do V8 (`at f (arq:l:c)`) ou do Firefox/Safari (`f@arq:l:c`), do mais antigo ao mais novo. */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    const v8 = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    const gecko = v8 ? null : /^\s*(.*?)@(.+?):(\d+):(\d+)$/.exec(line);
    const m = v8 ?? gecko;
    if (!m) continue;
    const [, fn, filename = '', lineno, colno] = m;
    frames.push({
      ...(fn ? { function: fn } : {}),
      filename,
      lineno: Number(lineno),
      colno: Number(colno),
      in_app: !filename.includes('node_modules') && !filename.startsWith('node:'),
    });
  }
  return frames.reverse();
}

function hex(bytes: number): string {
  let s = '';
  for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  return s;
}

/** Código do erro de origem, quando houver (Postgres `57P01`, Node `ECONNRESET`). */
const errorCode = (e: Error): string | undefined => {
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
};

/**
 * O erro e as causas encadeadas (`error.cause`, até 3), da mais interna para a de fora, como o Sentry
 * espera. O drizzle embrulha o erro do Postgres em "Failed query" e a causa só aparece assim (OG-512).
 */
export function exceptionChain(err: Error): { type: string; value: string; stacktrace: { frames: StackFrame[] } }[] {
  const chain: Error[] = [err];
  for (let c = err.cause; c instanceof Error && chain.length < 4 && !chain.includes(c); c = c.cause) chain.push(c);
  return chain.reverse().map((e) => {
    const code = errorCode(e);
    return { type: e.name, value: code ? `${e.message} (${code})` : e.message, stacktrace: { frames: parseStack(e.stack) } };
  });
}

export class ErrorReporter {
  private readonly target: ParsedDsn | null;
  private windowStart = 0;
  private sentInWindow = 0;
  /** Envios em andamento (para `flush`). */
  private readonly pending = new Set<Promise<void>>();
  /** Erros enviados e descartados pelo limite (métricas). */
  readonly counts = { sent: 0, dropped: 0, failed: 0 };

  constructor(private readonly config: ErrorReporterConfig) {
    this.target = config.dsn ? parseDsn(config.dsn) : null;
  }

  get enabled(): boolean {
    return this.target !== null;
  }

  /** Corpo do envelope (exposto para testes). */
  envelope(error: unknown, context: ErrorContext = {}, eventId = hex(16)): string {
    const now = (this.config.now ?? Date.now)();
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
    const event = {
      event_id: eventId,
      timestamp: now / 1000,
      platform: this.config.platform ?? 'node',
      level: context.level ?? 'error',
      logger: this.config.service,
      ...(this.config.environment ? { environment: this.config.environment } : {}),
      ...(this.config.release ? { release: this.config.release } : {}),
      tags: { service: this.config.service, ...context.tags },
      ...(context.extra ? { extra: context.extra } : {}),
      exception: { values: exceptionChain(err) },
    };
    return [JSON.stringify({ event_id: eventId, sent_at: new Date(now).toISOString() }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
  }

  capture(error: unknown, context: ErrorContext = {}): void {
    if (!this.target) return;
    const now = (this.config.now ?? Date.now)();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.sentInWindow = 0;
    }
    if (this.sentInWindow >= (this.config.perMinute ?? 30)) {
      this.counts.dropped++;
      return;
    }
    this.sentInWindow++;
    const doFetch = this.config.fetch ?? fetch;
    const auth = `Sentry sentry_version=7, sentry_key=${this.target.publicKey}, sentry_client=outgun-web/0.1`;
    const p = doFetch(this.target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': auth },
      body: this.envelope(error, context),
      keepalive: true,
    })
      .then((res) => {
        if (res.ok) this.counts.sent++;
        else this.counts.failed++;
      })
      .catch(() => {
        this.counts.failed++;
      })
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  /** Espera os envios em andamento (antes de encerrar o processo). */
  async flush(timeoutMs = 2000): Promise<void> {
    await Promise.race([Promise.allSettled([...this.pending]), new Promise((r) => setTimeout(r, timeoutMs))]);
  }
}
