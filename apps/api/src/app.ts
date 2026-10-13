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
import { rankingRoutes } from './routes/ranking.js';
import { roomRoutes } from './routes/rooms.js';
import { generateSigningKey, parseSigningKeys, type SigningKey } from '@outgun/tickets';

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
  return Fastify({
    logger:
      deps.logger === false
        ? false
        : typeof deps.logger === 'object'
          ? { level: deps.logger.level ?? 'trace', stream: deps.logger.stream }
          : { level: deps.config.logLevel },
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

  await app.register(cookie);
  // Só JSON: um formulário de outro site não consegue mandar application/json sem CORS.
  app.removeContentTypeParser('text/plain');
  app.addHook('onRequest', async (request, reply) => {
    if (!csrfSafe(request.method, request.url, request.headers, deps.config.webOrigins)) {
      return reply.code(403).send({ error: 'forbidden', message: 'cross-site request refused' });
    }
  });

  // Cabeçalhos básicos de segurança; respostas de conta nunca ficam em cache.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
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
