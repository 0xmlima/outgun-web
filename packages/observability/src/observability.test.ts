// SPDX-License-Identifier: GPL-2.0-or-later
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, ErrorReporter, exceptionChain, metricsAuthorized, parseDsn, parseStack, Registry, requestId } from './index.js';

describe('Registry', () => {
  it('exporta contadores, medidores e histogramas no formato do Prometheus', () => {
    const r = new Registry();
    const c = r.counter('outgun_test_total', 'Teste.');
    c.inc();
    c.inc(2, { kind: 'a"b' });
    r.gauge('outgun_rooms', 'Salas.', () => 3);
    r.gauge('outgun_players', 'Jogadores.', () => [[{ mode: 'casual' }, 5]]);
    const h = r.histogram('outgun_tick_duration_seconds', 'Tick.', [0.001, 0.01]);
    h.observe(0.0005);
    h.observe(0.005);
    h.observe(0.5);
    expect(r.render()).toBe(
      [
        '# HELP outgun_test_total Teste.',
        '# TYPE outgun_test_total counter',
        'outgun_test_total 1',
        'outgun_test_total{kind="a\\"b"} 2',
        '# HELP outgun_rooms Salas.',
        '# TYPE outgun_rooms gauge',
        'outgun_rooms 3',
        '# HELP outgun_players Jogadores.',
        '# TYPE outgun_players gauge',
        'outgun_players{mode="casual"} 5',
        '# HELP outgun_tick_duration_seconds Tick.',
        '# TYPE outgun_tick_duration_seconds histogram',
        'outgun_tick_duration_seconds_bucket{le="0.001"} 1',
        'outgun_tick_duration_seconds_bucket{le="0.01"} 2',
        'outgun_tick_duration_seconds_bucket{le="+Inf"} 3',
        'outgun_tick_duration_seconds_sum 0.5055',
        'outgun_tick_duration_seconds_count 3',
        '',
      ].join('\n'),
    );
  });

  it('estima quantis como o histogram_quantile', () => {
    const h = new Registry().histogram('h', 'h', [0.01, 0.02, 0.05]);
    for (let i = 0; i < 90; i++) h.observe(0.005);
    for (let i = 0; i < 10; i++) h.observe(0.03);
    expect(h.quantile(0.5)).toBeCloseTo(0.005 * (50 / 90) * 2, 6);
    // p95 cai na faixa 0,02–0,05: 5 de 10 observações → metade da faixa
    expect(h.quantile(0.95)).toBeCloseTo(0.035, 6);
  });

  it('recusa nomes inválidos e repetidos', () => {
    const r = new Registry();
    r.counter('a_total', 'a');
    expect(() => r.counter('a_total', 'a')).toThrow();
    expect(() => r.gauge('1x', 'x')).toThrow();
  });
});

describe('metricsAuthorized', () => {
  it('exige o token quando configurado', () => {
    expect(metricsAuthorized(undefined, undefined)).toBe(true);
    expect(metricsAuthorized('s3', 'Bearer s3')).toBe(true);
    expect(metricsAuthorized('s3', 'Bearer x')).toBe(false);
    expect(metricsAuthorized('s3', undefined)).toBe(false);
  });
});

describe('logger', () => {
  it('escreve JSON com serviço e mascara segredos', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const log = createLogger({ service: 'game-server', env: 'test', version: '1.2.3' }, sink).child({ room: 'main' });
    log.info({ ticket: 'eyJ...', jti: 'abc' }, 'entrou');
    const entry = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(entry).toMatchObject({ level: 'info', service: 'game-server', env: 'test', version: '1.2.3', room: 'main', jti: 'abc', ticket: '[redacted]', msg: 'entrou' });
    expect(typeof entry.time).toBe('string');
  });

  it('aproveita x-request-id bem formado e gera um novo nos demais casos', () => {
    expect(requestId('gs-main-00000001')).toBe('gs-main-00000001');
    expect(requestId('a b')).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('ErrorReporter', () => {
  it('interpreta o DSN', () => {
    expect(parseDsn('https://abc@o1.ingest.sentry.io/42')).toEqual({ url: 'https://o1.ingest.sentry.io/api/42/envelope/', publicKey: 'abc' });
    expect(parseDsn('http://k@localhost:8000/glitch/7')).toEqual({ url: 'http://localhost:8000/glitch/api/7/envelope/', publicKey: 'k' });
    expect(parseDsn('lixo')).toBeNull();
  });

  it('separa pilhas do V8 e do Firefox do quadro mais antigo ao mais novo', () => {
    const v8 = 'Error: x\n    at tick (/app/dist/room.js:10:5)\n    at /app/node_modules/a/b.js:1:2\n    at node:internal/timers:3:4';
    expect(parseStack(v8)).toEqual([
      { filename: 'node:internal/timers', lineno: 3, colno: 4, in_app: false },
      { filename: '/app/node_modules/a/b.js', lineno: 1, colno: 2, in_app: false },
      { function: 'tick', filename: '/app/dist/room.js', lineno: 10, colno: 5, in_app: true },
    ]);
    expect(parseStack('draw@https://x/assets/game.js:3:9')).toEqual([{ function: 'draw', filename: 'https://x/assets/game.js', lineno: 3, colno: 9, in_app: true }]);
  });

  it('envia o envelope com autenticação e respeita o limite por minuto', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const reporter = new ErrorReporter({
      dsn: 'https://abc@sentry.example/9',
      service: 'api',
      environment: 'staging',
      release: '0.1.0',
      perMinute: 2,
      now: () => 1_000_000,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
    });
    reporter.capture(new TypeError('quebrou'), { tags: { room: 'main' } });
    reporter.capture('texto');
    reporter.capture(new Error('demais'));
    await reporter.flush();
    expect(calls).toHaveLength(2);
    expect(reporter.counts).toEqual({ sent: 2, dropped: 1, failed: 0 });
    expect(calls[0]?.url).toBe('https://sentry.example/api/9/envelope/');
    expect((calls[0]?.init.headers as Record<string, string>)['x-sentry-auth']).toContain('sentry_key=abc');
    const [head, item, event] = (calls[0]?.init.body as string).split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(item).toEqual({ type: 'event' });
    expect(head?.event_id).toBe((event as { event_id: string }).event_id);
    expect(event).toMatchObject({ environment: 'staging', release: '0.1.0', tags: { service: 'api', room: 'main' }, exception: { values: [{ type: 'TypeError', value: 'quebrou' }] } });
  });

  it('leva a causa encadeada, da mais interna para a de fora (OG-512)', () => {
    const pg = Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' });
    const values = exceptionChain(new Error('Failed query: select "id" from "casual_presets"', { cause: pg }));
    expect(values.map((v) => v.value)).toEqual(['terminating connection due to administrator command (57P01)', 'Failed query: select "id" from "casual_presets"']);
    expect(exceptionChain(new Error('só'))).toHaveLength(1);
  });

  it('sem DSN não envia nada', () => {
    const reporter = new ErrorReporter({ service: 'web' });
    expect(reporter.enabled).toBe(false);
    reporter.capture(new Error('x'));
    expect(reporter.counts.sent + reporter.counts.dropped).toBe(0);
  });
});
