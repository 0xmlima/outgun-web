// SPDX-License-Identifier: GPL-2.0-or-later
// Canal ao vivo do portal (OG-284): `GET /live` em Server-Sent Events. Cada aviso é só o tópico que
// mudou (`event: rooms` etc.); o cliente relê o endpoint de sempre. Com sessão, a conexão recebe
// também as notificações da conta. Comentário a cada 25 s para o proxy não fechar a conexão parada;
// no máximo LIVE_PER_IP conexões por IP (padrão 20: lan house, várias abas) e LIVE_MAX_CONNECTIONS
// no total (padrão 2000); acima disso, 503 e o cliente fica nas consultas periódicas.
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { ServerResponse } from 'node:http';
import type { AppDeps, Services } from '../app.js';
import { liveBus, type LiveBus } from '../live.js';

const KEEPALIVE_MS = 25_000;

export function liveRoutes(_deps: AppDeps, services: Services, bus: LiveBus = liveBus): FastifyPluginAsyncTypebox {
  const max = Number(process.env.LIVE_MAX_CONNECTIONS ?? 2000);
  const perIpMax = Number(process.env.LIVE_PER_IP ?? 20);
  const perIp = new Map<string, number>();
  const open = new Set<ServerResponse>();
  return async (app) => {
    // conexões abertas não seguram o desligamento (deploy sem queda): fecham antes do servidor
    app.addHook('preClose', async () => {
      for (const res of open) res.end();
    });
    app.get('/live', { schema: { tags: ['portal'], summary: 'Avisos ao vivo do portal (SSE): rooms, matches e, com sessão, notifications' } }, async (request, reply) => {
      const ip = request.ip;
      if (bus.size >= max || (perIp.get(ip) ?? 0) >= perIpMax) return reply.code(503).header('retry-after', '30').send({ error: 'busy', message: 'too many live connections, polling still works' });
      const user = await services.sessions.current(request);
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      // reconexão do EventSource depois de 5 s; `hello` confirma o canal ao cliente
      res.write(`retry: 5000\nevent: hello\ndata: {}\n\n`);
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
      const unsubscribe = bus.subscribe((topic) => res.write(`event: ${topic}\ndata: {}\n\n`), user?.id ?? null);
      const ping = setInterval(() => res.write(': ping\n\n'), KEEPALIVE_MS);
      const done = () => {
        clearInterval(ping);
        unsubscribe();
        const n = (perIp.get(ip) ?? 1) - 1;
        if (n <= 0) perIp.delete(ip);
        else perIp.set(ip, n);
      };
      open.add(res);
      res.once('close', () => {
        open.delete(res);
        done();
      });
    });
  };
}
