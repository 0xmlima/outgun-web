// SPDX-License-Identifier: GPL-2.0-or-later
// Telemetria de rede (OG-108): resumos anônimos que os clientes mandam ao sair da partida. Não
// lê sessão nem guarda IP; a região vem da sala. Vira métricas do Prometheus e um agregado no painel.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { DURATION_BUCKETS } from '@outgun/observability';
import { eq } from 'drizzle-orm';
import type { AppDeps, Services } from '../app.js';
import { gameServers, netReports, rooms } from '../db/schema.js';
import { ErrorSchema, RoomId } from './schemas.js';

const HOUR = 60 * 60_000;
const Ms = Type.Integer({ minimum: 0, maximum: 60_000 });

export const NetReportBody = Type.Object(
  {
  room: RoomId,
  version: Type.String({ maxLength: 40 }),
  browser: Type.String({ maxLength: 40 }),
  durationS: Type.Integer({ minimum: 1, maximum: 86_400 }),
  pingP50: Type.Union([Ms, Type.Null()]),
  pingP95: Type.Union([Ms, Type.Null()]),
  lagP50: Ms,
  lagP95: Ms,
  fpsP5: Type.Integer({ minimum: 0, maximum: 10_000 }),
  fpsP50: Type.Integer({ minimum: 0, maximum: 10_000 }),
  correctionsPerMin: Type.Number({ minimum: 0, maximum: 10_000 }),
  stallSeconds: Type.Integer({ minimum: 0, maximum: 86_400 }),
  framesPerSecond: Type.Number({ minimum: 0, maximum: 100 }),
  },
  // campos extras (nome, conta...) são descartados antes de chegar aqui
  { additionalProperties: false },
);

export function telemetryRoutes({ database }: AppDeps, services: Services): FastifyPluginAsyncTypebox {
  const { db } = database;
  return async (app) => {
    const ping = app.metrics.histogram('outgun_client_ping_seconds', 'Ping p50 dos clientes por partida (telemetria anônima).', DURATION_BUCKETS);
    const corrections = app.metrics.histogram('outgun_client_corrections_per_minute', 'Correções de predição por minuto dos clientes.', [0, 1, 2, 5, 10, 20, 50, 100]);
    const fps = app.metrics.histogram('outgun_client_fps_p5', 'fps p5 dos clientes por partida.', [10, 20, 30, 45, 55, 60, 90, 120, 144]);
    const stall = app.metrics.counter('outgun_client_stall_seconds_total', 'Segundos de partida com menos de 8 dos 10 frames esperados.');
    const played = app.metrics.counter('outgun_client_seconds_total', 'Segundos de partida cobertos pela telemetria.');

    app.post(
      '/telemetry',
      {
        schema: {
          tags: ['beta'],
          summary: 'Resumo anônimo da rede de uma partida (ping, atraso, correções de predição, fps); sem conta nem IP',
          body: NetReportBody,
          response: { 204: Type.Null(), 400: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        if (!(await services.rateLimit.allow(`telemetry:${request.ip}`, 60, HOUR))) return reply.code(429).send({ error: 'rate_limited', message: 'too many reports' });
        const b = request.body;
        const [room] = await db.select({ region: gameServers.region }).from(rooms).leftJoin(gameServers, eq(gameServers.id, rooms.serverId)).where(eq(rooms.id, b.room));
        const region = room?.region ?? null;
        await db.insert(netReports).values({ roomId: room ? b.room : null, region, ...b });
        const labels = { region: region ?? 'desconhecida' };
        if (b.pingP50 !== null) ping.observe(b.pingP50 / 1000, labels);
        corrections.observe(b.correctionsPerMin, labels);
        fps.observe(b.fpsP5, labels);
        stall.inc(b.stallSeconds, labels);
        played.inc(b.durationS, labels);
        return reply.code(204).send(null);
      },
    );
  };
}
