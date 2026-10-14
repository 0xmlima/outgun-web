// SPDX-License-Identifier: GPL-2.0-or-later
// Métricas, correlação e envio de erros da API (OG-102). Não precisa do PostgreSQL: o /health usa
// um banco falso que responde ao SELECT 1.
import { Writable } from 'node:stream';
import { ErrorReporter } from '@outgun/observability';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import type { Database } from './db/client.js';

const fakeDatabase = { db: {}, sql: () => Promise.resolve([]), close: async () => {} } as unknown as Database;

async function setup(env: Record<string, string> = {}) {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const l of chunk.toString().split('\n')) if (l) lines.push(JSON.parse(l) as Record<string, unknown>);
      cb();
    },
  });
  const sent: string[] = [];
  const errors = new ErrorReporter({
    dsn: 'https://k@errors.example/1',
    service: 'api',
    fetch: (async (_url: string, init: RequestInit) => {
      sent.push(init.body as string);
      return new Response('{}');
    }) as typeof fetch,
  });
  const app = await buildApp({ config: loadConfig(env), database: fakeDatabase, logger: { stream, level: 'info' }, errors });
  app.get('/boom', { schema: { hide: true } }, async () => {
    throw new Error('quebrou de propósito');
  });
  return { app, lines, sent, errors };
}

describe('observabilidade da API', () => {
  it('devolve e registra o x-request-id recebido; gera um quando falta', async () => {
    const { app, lines } = await setup();
    const res = await app.inject({ url: '/health', headers: { 'x-request-id': 'gs-main-0000001' } });
    expect(res.headers['x-request-id']).toBe('gs-main-0000001');
    expect(lines.find((l) => l.msg === 'request completed')).toMatchObject({ service: 'api', reqId: 'gs-main-0000001' });
    const other = await app.inject({ url: '/health' });
    expect(other.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    await app.close();
  });

  it('exporta a latência por rota (sem a URL crua) e conta erros 5xx', async () => {
    const { app, sent, errors } = await setup();
    await app.inject({ url: '/health' });
    await app.inject({ url: '/nao-existe/alguem' });
    await app.inject({ url: '/boom' });
    await errors.flush();
    const metrics = (await app.inject({ url: '/metrics' })).body;
    expect(metrics).toMatch(/^http_request_duration_seconds_count\{method="GET",route="\/health",status="200"\} 1$/m);
    expect(metrics).not.toContain('alguem');
    expect(metrics).toMatch(/^http_request_duration_seconds_count\{method="GET",route="unmatched",status="404"\} 1$/m);
    expect(metrics).toMatch(/^outgun_api_errors_total\{route="\/boom"\} 1$/m);
    expect(metrics).toMatch(/^outgun_error_reports_total\{result="sent"\} 1$/m);
    expect(sent[0]).toContain('quebrou de propósito');
    await app.close();
  });

  it('com METRICS_TOKEN, /metrics exige o token', async () => {
    const { app } = await setup({ METRICS_TOKEN: 'segredo' });
    expect((await app.inject({ url: '/metrics' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/metrics', headers: { authorization: 'Bearer segredo' } })).statusCode).toBe(200);
    await app.close();
  });
});
