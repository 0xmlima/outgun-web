// SPDX-License-Identifier: GPL-2.0-or-later
// Só em desenvolvimento (DEV_ROUTES=1 e MAILER=memory): caixa de saída para o roteiro E2E ler os
// e-mails sem um servidor de e-mail. Fica fora da OpenAPI.
import type { FastifyPluginAsync } from 'fastify';
import type { MemoryMailer } from '../mail/mailer.js';

export function devRoutes(mailer: MemoryMailer): FastifyPluginAsync {
  return async (app) => {
    app.get('/mail', { schema: { hide: true } }, async () => ({ outbox: mailer.outbox }));
  };
}
