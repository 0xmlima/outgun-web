// SPDX-License-Identifier: GPL-2.0-or-later
// Beta fechado (OG-106): o cliente pergunta se está no beta (pede convite no cadastro) e os
// testadores mandam feedback com a nota de fidelidade ao original, que o painel resume. O tipo bug
// leva os campos do modelo de issue do GitHub (OG-429).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AppDeps, Services } from '../app.js';
import { feedback, matches, matchPlayers, type BugReport } from '../db/schema.js';
import { ErrorSchema } from './schemas.js';

/** Áreas do relato de bug; os rótulos ficam no cliente (`FeedbackScreen.tsx`) e na issue (`github.ts`). */
export const BUG_AREAS = ['match', 'lobby', 'ranked', 'portal', 'clan', 'report', 'replay', 'account', 'moderation', 'desktop', 'connection', 'other'] as const;

const text = (max: number) => Type.String({ maxLength: max });
export const BugSchema = Type.Object({
  area: Type.Union(BUG_AREAS.map((a) => Type.Literal(a))),
  summary: text(200),
  steps: text(2000),
  expected: text(1000),
  actual: text(2000),
  frequency: Type.Union([Type.Literal('always'), Type.Literal('sometimes'), Type.Literal('once')]),
  severity: Type.Union([Type.Literal('critical'), Type.Literal('high'), Type.Literal('medium'), Type.Literal('low')]),
  evidence: text(1000),
  workaround: text(1000),
});

const HOUR = 60 * 60_000;
/** A situação de uma issue aberta é relida do GitHub no máximo a cada 5 min (OG-431). */
const ISSUE_RECHECK_MS = 5 * 60_000;
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
            bug: Type.Optional(BugSchema),
          }),
          response: { 201: Type.Object({ id: Type.Integer() }), 400: ErrorSchema, 401: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await services.sessions.current(request);
        if (!user) return reply.code(401).send({ error: 'login_required', message: 'sign in to send feedback' });
        const b = request.body;
        const bug: BugReport | null = b.kind === 'bug' && b.bug ? trimBug(b.bug) : null;
        if (bug && (!bug.summary || !bug.actual)) {
          return reply.code(400).send({ error: 'bug_incomplete', message: 'summary and what happened are required' });
        }
        if (!bug && !b.text.trim() && b.fidelity === undefined && b.overall === undefined) {
          return reply.code(400).send({ error: 'empty_feedback', message: 'give a rating or a text' });
        }
        if (!(await services.rateLimit.allow(`feedback:${user.id}`, 20, HOUR))) {
          return reply.code(429).send({ error: 'rate_limited', message: 'too much feedback, try later' });
        }
        // a última partida do jogador vai junto: é a evidência mais comum de um bug
        const [last] = bug
          ? await deps.database.db
              .select({ id: matches.id })
              .from(matchPlayers)
              .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
              .where(eq(matchPlayers.userId, user.id))
              .orderBy(desc(matches.endedAt))
              .limit(1)
          : [];
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
            context: { ...b.context, ...(last ? { match: last.id } : {}), userAgent: (request.headers['user-agent'] ?? '').slice(0, 200) },
            bug,
          })
          .returning({ id: feedback.id });
        return reply.code(201).send({ id: row!.id });
      },
    );

    app.get(
      '/feedback/mine',
      { schema: { tags: ['beta'], summary: 'Os relatos do próprio jogador, com a situação da issue do GitHub (OG-431)' } },
      async (request, reply) => {
        const user = await services.sessions.current(request);
        if (!user) return reply.code(401).send({ error: 'login_required', message: 'sign in to see your reports' });
        const db = deps.database.db;
        const mine = () => db.select().from(feedback).where(eq(feedback.userId, user.id)).orderBy(desc(feedback.createdAt)).limit(50);
        let rows = await mine();
        const now = Date.now();
        const stale = rows.filter((f) => f.githubIssue !== null && f.issueState === 'open' && (!f.issueCheckedAt || now - f.issueCheckedAt.getTime() > ISSUE_RECHECK_MS)).slice(0, 10);
        if (services.issues && stale.length) {
          const issues = services.issues;
          await Promise.all(
            stale.map(async (f) => {
              try {
                const st = await issues.get(f.githubIssue!);
                const closed = st.state === 'closed';
                const state = !closed ? 'open' : st.stateReason === 'not_planned' ? 'not_planned' : 'closed';
                await db
                  .update(feedback)
                  .set({ issueState: state, fixedIn: state === 'closed' ? st.milestone : null, issueCheckedAt: new Date(), ...(state === 'closed' ? { status: 'resolved' as const } : {}) })
                  .where(and(eq(feedback.id, f.id), inArray(feedback.status, ['new', 'confirmed', 'critical', 'resolved'])));
              } catch (err) {
                request.log.warn({ err, issue: f.githubIssue }, 'falha ao ler a issue no GitHub');
              }
            }),
          );
          rows = await mine();
        }
        return {
          reports: rows.map((f) => ({
            id: f.id,
            kind: f.kind,
            summary: f.bug?.summary ?? f.text.slice(0, 200),
            status: f.status,
            issue: f.githubIssue !== null ? { number: f.githubIssue, url: f.githubUrl, state: f.issueState, fixedIn: f.fixedIn } : null,
            createdAt: f.createdAt.toISOString(),
          })),
        };
      },
    );
  };
}

function trimBug(b: BugReport): BugReport {
  const t = (s: string) => s.trim();
  return { ...b, summary: t(b.summary), steps: t(b.steps), expected: t(b.expected), actual: t(b.actual), evidence: t(b.evidence), workaround: t(b.workaround) };
}
