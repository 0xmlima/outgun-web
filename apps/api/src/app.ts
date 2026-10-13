// SPDX-License-Identifier: GPL-2.0-or-later
// Monta a API (Fastify). Quem chama fornece o banco e, opcionalmente, o Redis; main.ts liga tudo.
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import type { Redis } from 'ioredis';
import type { ApiConfig } from './config.js';
import type { Database } from './db/client.js';
import { healthRoutes } from './routes/health.js';
import { internalRoutes } from './routes/internal.js';
import { roomRoutes } from './routes/rooms.js';

export const API_VERSION = '0.1.0';

export interface AppDeps {
  config: ApiConfig;
  database: Database;
  redis?: Redis | undefined;
  /** false desliga os logs (testes). */
  logger?: boolean;
}

function createFastify(deps: AppDeps) {
  return Fastify({
    logger: deps.logger === false ? false : { level: deps.config.logLevel },
    bodyLimit: 256 * 1024,
    trustProxy: true,
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
  await app.register(roomRoutes(deps));
  await app.register(internalRoutes(deps), { prefix: '/internal' });
  return app;
}
