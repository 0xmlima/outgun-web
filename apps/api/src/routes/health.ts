// SPDX-License-Identifier: GPL-2.0-or-later
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { API_VERSION, type AppDeps } from '../app.js';

const Health = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
  version: Type.String(),
  database: Type.Boolean(),
  redis: Type.Union([Type.Literal('ok'), Type.Literal('down'), Type.Literal('disabled')]),
});

export function healthRoutes({ database, redis }: AppDeps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      '/health',
      { schema: { tags: ['sistema'], summary: 'Estado da API e das dependências', response: { 200: Health, 503: Health } } },
      async (_request, reply) => {
        const db = await database.sql`SELECT 1`.then(
          () => true,
          () => false,
        );
        const cache = !redis
          ? ('disabled' as const)
          : await redis.ping().then(
              () => 'ok' as const,
              () => 'down' as const,
            );
        const ok = db && cache !== 'down';
        return reply
          .code(db ? 200 : 503)
          .send({ status: ok ? 'ok' : 'degraded', version: API_VERSION, database: db, redis: cache });
      },
    );
  };
}
