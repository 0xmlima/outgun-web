// SPDX-License-Identifier: GPL-2.0-or-later
// Monta a API (Fastify). Quem chama fornece o banco e, opcionalmente, o Redis; main.ts liga tudo.
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import type { Redis } from 'ioredis';
import type { ApiConfig } from './config.js';
import type { Database } from './db/client.js';
import { LoginThrottle, MemoryCounterStore, RateLimit, RedisCounterStore, type CounterStore } from './auth/limiter.js';
import { SessionStore } from './auth/sessions.js';
import { LogMailer, MailpitMailer, MemoryMailer, ResendMailer, type Mailer } from './mail/mailer.js';
import { accountRoutes } from './routes/account.js';
import { authRoutes } from './routes/auth.js';
import { devRoutes } from './routes/dev.js';
import { healthRoutes } from './routes/health.js';
import { internalRoutes } from './routes/internal.js';
import { nameRoutes } from './routes/names.js';
import { joinRoutes } from './routes/join.js';
import { playerRoutes } from './routes/players.js';
import { rankingRoutes } from './routes/ranking.js';
import { roomRoutes } from './routes/rooms.js';
import { generateSigningKey, parseSigningKeys, type SigningKey } from '@outgun/tickets';
import { DURATION_BUCKETS, ErrorReporter, loggerOptions, metricsAuthorized, PROMETHEUS_CONTENT_TYPE, Registry, registerProcessMetrics, requestId } from '@outgun/observability';

export const API_VERSION = '0.1.0';

export interface AppDeps {
  config: ApiConfig;
  database: Database;
  redis?: Redis | undefined;
  /** false desliga os logs; um stream recebe os logs em JSON (testes). */
  logger?: boolean | { stream: NodeJS.WritableStream; level?: string };
  /** Substitui o envio configurado em MAILER (testes). */
  mailer?: Mailer;
  /** Substitui os contadores de tentativas (padrão: Redis, ou memória sem Redis). */
  counters?: CounterStore;
  /** Substitui o envio de erros configurado em SENTRY_DSN (testes). */
  errors?: ErrorReporter;
  /** Desligando (OG-103): /health responde 503 para o balanceador tirar a instância do rodízio. */
  lifecycle?: { stopping: boolean };
}

/** Serviços montados a partir das dependências, usados pelas rotas de conta. */
export interface Services {
  sessions: SessionStore;
  throttle: LoginThrottle;
  rateLimit: RateLimit;
  mailer: Mailer;
  /** Chaves dos tickets de entrada; a primeira assina (OG-083). */
  ticketKeys: SigningKey[];
}

function ticketKeys(config: ApiConfig): SigningKey[] {
  if (config.ticketSigningKeys) return parseSigningKeys(config.ticketSigningKeys);
  if (process.env.NODE_ENV === 'production') throw new Error('TICKET_SIGNING_KEYS é obrigatória em produção');
  // Desenvolvimento: chave nova a cada partida; os game servers buscam o JWKS.
  return [generateSigningKey(`dev-${Date.now().toString(36)}`)];
}

function makeMailer(deps: AppDeps, log: App['log']): Mailer {
  const { config } = deps;
  if (deps.mailer) return deps.mailer;
  switch (config.mailer) {
    case 'memory':
      return new MemoryMailer();
    case 'mailpit':
      return new MailpitMailer(config.mailpitUrl, config.mailFrom);
    case 'resend':
      if (!config.resendApiKey) throw new Error('MAILER=resend exige RESEND_API_KEY');
      return new ResendMailer(config.resendApiKey, config.mailFrom);
    default:
      return new LogMailer(log);
  }
}

function createFastify(deps: AppDeps) {
  const base = loggerOptions({ service: 'api', level: deps.config.logLevel, env: deps.config.environment, ...(deps.config.release ? { version: deps.config.release } : {}) });
  return Fastify({
    logger:
      deps.logger === false
        ? false
        : typeof deps.logger === 'object'
          ? { ...base, level: deps.logger.level ?? 'trace', stream: deps.logger.stream }
          : base,
    // correlação (OG-102): aproveita o x-request-id de quem chamou (game server, proxy) e o devolve
    genReqId: (req) => requestId(req.headers['x-request-id']),
    bodyLimit: 256 * 1024,
    trustProxy: deps.config.trustProxy,
  }).withTypeProvider<TypeBoxTypeProvider>();
}

export type App = ReturnType<typeof createFastify>;

declare module 'fastify' {
  interface FastifyRequest {
    /** Corpo cru (JSON), usado na verificação HMAC das rotas internas. */
    rawBody?: string;
    /** serverId autenticado nas rotas internas. */
    serverId?: string;
  }
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const app = createFastify(deps);

  const counters = deps.counters ?? (deps.redis ? new RedisCounterStore(deps.redis) : new MemoryCounterStore());
  const services: Services = {
    sessions: new SessionStore(deps.database.db, deps.config.sessionTtlMs, deps.config.cookieSecure),
    throttle: new LoginThrottle(counters),
    rateLimit: new RateLimit(counters),
    mailer: makeMailer(deps, app.log),
    ticketKeys: ticketKeys(deps.config),
  };

  observe(app, deps);
  await app.register(cookie);
  // Só JSON: um formulário de outro site não consegue mandar application/json sem CORS.
  app.removeContentTypeParser('text/plain');
  app.addHook('onRequest', async (request, reply) => {
    if (!csrfSafe(request.method, request.url, request.headers, deps.config.webOrigins)) {
      return reply.code(403).send({ error: 'forbidden', message: 'cross-site request refused' });
    }
  });

  // Cabeçalhos de segurança (OG-104); respostas de conta nunca ficam em cache.
  app.addHook('onSend', async (request, reply) => {
    for (const [name, value] of Object.entries(apiSecurityHeaders(request.url, deps.config.cookieSecure))) reply.header(name, value);
    if (request.url.startsWith('/auth/') || request.url.startsWith('/account')) reply.header('cache-control', 'no-store');
  });

  // Guarda o corpo cru antes do parse: a assinatura HMAC cobre exatamente os bytes recebidos.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const text = body as string;
    request.rawBody = text;
    if (text.length === 0) return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(Object.assign(new Error('invalid JSON body'), { statusCode: 400 }), undefined);
    }
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Outgun Web API',
        version: API_VERSION,
        description: 'Contas, salas, partidas e ranking do Outgun Web. Rotas /internal: só game servers (HMAC).',
        license: { name: 'GPL-2.0-or-later', url: 'https://spdx.org/licenses/GPL-2.0-or-later.html' },
      },
      components: {
        securitySchemes: {
          gameServerHmac: {
            type: 'apiKey',
            in: 'header',
            name: 'x-outgun-signature',
            description:
              'HMAC-SHA256 hex de `timestamp.MÉTODO.caminho.sha256(corpo)` com o segredo do servidor; ' +
              'acompanhado de x-outgun-server e x-outgun-timestamp (ms).',
          },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  await app.register(healthRoutes(deps));
  await app.register(roomRoutes(deps, services));
  await app.register(rankingRoutes(deps));
  await app.register(playerRoutes(deps));
  await app.register(nameRoutes(deps));
  await app.register(joinRoutes(deps, services));
  await app.register(authRoutes(deps, services), { prefix: '/auth' });
  await app.register(accountRoutes(deps, services), { prefix: '/account' });
  if (deps.config.devRoutes && services.mailer instanceof MemoryMailer) {
    await app.register(devRoutes(services.mailer), { prefix: '/dev' });
  }
  await app.register(internalRoutes(deps), { prefix: '/internal' });
  return app;
}

/**
 * Cabeçalhos de segurança de toda resposta (OG-104, ASVS V14.4). A API só devolve JSON: a CSP não
 * deixa nada carregar nem ser emoldurado; /docs (Swagger UI) fica com a CSP do próprio plugin. HSTS
 * só com cookies seguros (produção atrás de TLS).
 */
export function apiSecurityHeaders(url: string, https: boolean): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-site',
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    ...(url.startsWith('/docs') ? {} : { 'content-security-policy': "default-src 'none'; frame-ancestors 'none'" }),
    ...(https ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}

/** Métricas HTTP, /metrics, x-request-id na resposta e envio de erros 5xx (OG-102). */
function observe(app: App, deps: AppDeps): void {
  const registry = new Registry();
  const duration = registry.histogram('http_request_duration_seconds', 'Duração dos pedidos HTTP por método, rota e status.', DURATION_BUCKETS);
  const errors = registry.counter('outgun_api_errors_total', 'Respostas 5xx e exceções não tratadas.');
  const reporter = deps.errors ?? new ErrorReporter({ dsn: deps.config.sentryDsn, service: 'api', environment: deps.config.environment, release: deps.config.release });
  registry.counterFrom('outgun_error_reports_total', 'Erros enviados ao serviço de erros, por resultado.', () => [
    [{ result: 'sent' }, reporter.counts.sent],
    [{ result: 'dropped' }, reporter.counts.dropped],
    [{ result: 'failed' }, reporter.counts.failed],
  ]);
  registerProcessMetrics(registry);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    // rota do roteador (`/players/:name`), não a URL: cardinalidade fixa; 404 sem rota vira "unmatched"
    const route = request.routeOptions.url ?? 'unmatched';
    if (route === '/metrics') return;
    duration.observe(reply.elapsedTime / 1000, { method: request.method, route, status: String(reply.statusCode) });
    if (reply.statusCode >= 500) errors.inc(1, { route });
  });
  app.addHook('onError', async (request, _reply, error) => {
    if ((error as { statusCode?: number }).statusCode !== undefined && (error as { statusCode: number }).statusCode < 500) return;
    reporter.capture(error, { tags: { route: request.routeOptions.url ?? 'unmatched', method: request.method, reqId: request.id } });
  });
  app.addHook('onClose', async () => {
    await reporter.flush();
  });
  // ASVS 7.4.1: erro interno não vai para o cliente (só para o log e o serviço de erros)
  app.setErrorHandler((error: { statusCode?: number }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status < 500) return reply.send(error);
    request.log.error({ err: error }, 'erro interno');
    return reply.code(status).send({ error: 'internal', message: 'internal error', reqId: request.id });
  });

  app.get('/metrics', { schema: { hide: true } }, async (request, reply) => {
    if (!metricsAuthorized(deps.config.metricsToken, request.headers.authorization)) return reply.code(401).send();
    return reply.header('content-type', PROMETHEUS_CONTENT_TYPE).header('cache-control', 'no-store').send(registry.render());
  });
}

/**
 * Proteção CSRF dos pedidos que mudam estado (além do cookie SameSite=Lax e de só aceitar JSON):
 * recusa navegador avisando que o pedido é de outro site e Origin fora da lista. As rotas internas
 * não usam cookie (HMAC) e ficam de fora.
 */
export function csrfSafe(
  method: string,
  url: string,
  headers: Record<string, string | string[] | undefined>,
  origins: readonly string[],
): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || url.startsWith('/internal/')) return true;
  if (headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = headers.origin;
  return typeof origin !== 'string' || origin === 'null' ? origin === undefined : origins.includes(origin);
}
