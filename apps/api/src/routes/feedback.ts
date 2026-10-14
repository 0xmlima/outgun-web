// SPDX-License-Identifier: GPL-2.0-or-later
// Beta fechado (OG-106): o cliente pergunta se está no beta (pede convite no cadastro) e os
// testadores mandam feedback com a nota de fidelidade ao original, que o painel resume.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppDeps, Services } from '../app.js';
import { feedback } from '../db/schema.js';
import { ErrorSchema } from './schemas.js';

const HOUR = 60 * 60_000;
const Rating = Type.Optional(Type.Integer({ minimum: 1, maximum: 5 }));

export function feedbackRoutes(deps: AppDeps, services: Services): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get('/beta', { schema: { tags: ['beta'], summary: 'Se o servidor está em beta fechado (cadastro com convite)', response: { 200: Type.Object({ beta: Type.Boolean() }) } } }, async () => ({
      beta: deps.config.beta,
    }));

    app.post(
      '/feedback',
      {
        schema: {
          tags: ['beta'],
          summary: 'Feedback de quem joga: tipo, notas de fidelidade e geral, texto e contexto (só com conta)',
          body: Type.Object({
            kind: Type.Union([Type.Literal('bug'), Type.Literal('suggestion'), Type.Literal('praise'), Type.Literal('other')]),
            fidelity: Rating,
            overall: Rating,
            veteran: Type.Optional(Type.Boolean()),
            text: Type.String({ maxLength: 4000 }),
            context: Type.Optional(Type.Record(Type.String({ maxLength: 32 }), Type.Union([Type.Number(), Type.String({ maxLength: 200 })]), { maxProperties: 16 })),
          }),
          response: { 201: Type.Object({ id: Type.Integer() }), 400: ErrorSchema, 401: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await services.sessions.current(request);
        if (!user) return reply.code(401).send({ error: 'login_required', message: 'sign in to send feedback' });
        const b = request.body;
        if (!b.text.trim() && b.fidelity === undefined && b.overall === undefined) {
          return reply.code(400).send({ error: 'empty_feedback', message: 'give a rating or a text' });
        }
        if (!(await services.rateLimit.allow(`feedback:${user.id}`, 20, HOUR))) {
          return reply.code(429).send({ error: 'rate_limited', message: 'too much feedback, try later' });
        }
        const [row] = await deps.database.db
          .insert(feedback)
          .values({
            userId: user.id,
            username: user.username,
            kind: b.kind,
            fidelity: b.fidelity ?? null,
            overall: b.overall ?? null,
            veteran: b.veteran ?? false,
            text: b.text.trim(),
            context: { ...b.context, userAgent: (request.headers['user-agent'] ?? '').slice(0, 200) },
          })
          .returning({ id: feedback.id });
        return reply.code(201).send({ id: row!.id });
      },
    );
  };
}
