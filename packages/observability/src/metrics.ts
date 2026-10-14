// SPDX-License-Identifier: GPL-2.0-or-later
// Métricas no formato texto do Prometheus (0.0.4): contadores, medidores e histogramas com rótulos.
// Implementação própria e pequena: o game server conta bytes a cada mensagem e um histograma por
// tick, sem alocar objetos no caminho quente.
import { createHash, timingSafeEqual } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export type Labels = Readonly<Record<string, string>>;

interface Metric {
  readonly name: string;
  render(out: string[]): void;
}

const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labelText(labels: Labels | undefined, extra?: [string, string]): string {
  const parts = Object.entries(labels ?? {}).map(([k, v]) => `${k}="${escapeLabel(v)}"`);
  if (extra) parts.push(`${extra[0]}="${escapeLabel(extra[1])}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

function key(labels: Labels | undefined): string {
  if (!labels) return '';
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}\u0000${labels[k]}`)
    .join('\u0001');
}

function num(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return '+Inf';
  if (v === -Infinity) return '-Inf';
  return String(v);
}

function header(out: string[], name: string, help: string, type: string): void {
  out.push(`# HELP ${name} ${help.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}`, `# TYPE ${name} ${type}`);
}

export class Counter implements Metric {
  private readonly values = new Map<string, { labels: Labels | undefined; value: number }>();

  constructor(
    readonly name: string,
    private readonly help: string,
  ) {}

  inc(value = 1, labels?: Labels): void {
    if (value < 0) throw new Error(`${this.name}: contador não diminui`);
    const k = key(labels);
    const entry = this.values.get(k);
    if (entry) entry.value += value;
    else this.values.set(k, { labels, value });
  }

  get(labels?: Labels): number {
    return this.values.get(key(labels))?.value ?? 0;
  }

  render(out: string[]): void {
    header(out, this.name, this.help, 'counter');
    if (this.values.size === 0) out.push(`${this.name} 0`);
    for (const { labels, value } of this.values.values()) out.push(`${this.name}${labelText(labels)} ${num(value)}`);
  }
}

/** Valor lido na hora da coleta (salas, jogadores...). Uma função pode devolver séries com rótulos. */
export type GaugeSource = () => number | ReadonlyArray<readonly [Labels, number]>;

export class Gauge implements Metric {
  private readonly values = new Map<string, { labels: Labels | undefined; value: number }>();

  constructor(
    readonly name: string,
    private readonly help: string,
    private readonly source?: GaugeSource,
    private readonly type: 'gauge' | 'counter' = 'gauge',
  ) {}

  set(value: number, labels?: Labels): void {
    this.values.set(key(labels), { labels, value });
  }

  render(out: string[]): void {
    header(out, this.name, this.help, this.type);
    if (this.source) {
      const v = this.source();
      if (typeof v === 'number') out.push(`${this.name} ${num(v)}`);
      else for (const [labels, value] of v) out.push(`${this.name}${labelText(labels)} ${num(value)}`);
      return;
    }
    for (const { labels, value } of this.values.values()) out.push(`${this.name}${labelText(labels)} ${num(value)}`);
  }
}

interface Series {
  labels: Labels | undefined;
  counts: number[];
  sum: number;
  count: number;
}

export class Histogram implements Metric {
  private readonly series = new Map<string, Series>();
  readonly buckets: readonly number[];

  constructor(
    readonly name: string,
    private readonly help: string,
    buckets: readonly number[],
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(value: number, labels?: Labels): void {
    const k = key(labels);
    let s = this.series.get(k);
    if (!s) {
      s = { labels, counts: new Array<number>(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.series.set(k, s);
    }
    // contagens por faixa (não acumuladas); a soma acumulada é feita só na exportação
    let i = 0;
    while (i < this.buckets.length && value > (this.buckets[i] as number)) i++;
    if (i < this.buckets.length) s.counts[i]!++;
    s.sum += value;
    s.count++;
  }

  /** Quantil estimado como o `histogram_quantile` do Prometheus (interpolação linear na faixa). */
  quantile(q: number, labels?: Labels): number {
    const s = this.series.get(key(labels));
    if (!s || s.count === 0) return 0;
    const rank = q * s.count;
    let acc = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      const c = s.counts[i] as number;
      if (acc + c >= rank && c > 0) {
        const lo = i === 0 ? 0 : (this.buckets[i - 1] as number);
        const hi = this.buckets[i] as number;
        return lo + (hi - lo) * ((rank - acc) / c);
      }
      acc += c;
    }
    return this.buckets[this.buckets.length - 1] as number;
  }

  render(out: string[]): void {
    header(out, this.name, this.help, 'histogram');
    for (const s of this.series.values()) {
      let acc = 0;
      this.buckets.forEach((b, i) => {
        acc += s.counts[i] as number;
        out.push(`${this.name}_bucket${labelText(s.labels, ['le', num(b)])} ${acc}`);
      });
      out.push(`${this.name}_bucket${labelText(s.labels, ['le', '+Inf'])} ${s.count}`);
      out.push(`${this.name}_sum${labelText(s.labels)} ${num(s.sum)}`);
      out.push(`${this.name}_count${labelText(s.labels)} ${s.count}`);
    }
  }
}

export class Registry {
  private readonly metrics = new Map<string, Metric>();

  private add<M extends Metric>(m: M): M {
    if (!NAME.test(m.name)) throw new Error(`nome de métrica inválido: ${m.name}`);
    if (this.metrics.has(m.name)) throw new Error(`métrica repetida: ${m.name}`);
    this.metrics.set(m.name, m);
    return m;
  }

  counter(name: string, help: string): Counter {
    return this.add(new Counter(name, help));
  }

  gauge(name: string, help: string, source?: GaugeSource): Gauge {
    return this.add(new Gauge(name, help, source));
  }

  /** Contador cujo total vem de outro lugar (lido na coleta). */
  counterFrom(name: string, help: string, source: GaugeSource): Gauge {
    return this.add(new Gauge(name, help, source, 'counter'));
  }

  histogram(name: string, help: string, buckets: readonly number[]): Histogram {
    return this.add(new Histogram(name, help, buckets));
  }

  render(): string {
    const out: string[] = [];
    for (const m of this.metrics.values()) m.render(out);
    return out.join('\n') + '\n';
  }
}

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

/** Faixas para durações curtas (s): do tick do jogo (ms) a pedidos HTTP lentos. */
export const DURATION_BUCKETS = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.1, 0.25, 0.5, 1, 2.5];

/** Métricas do processo Node: CPU, memória e atraso do event loop. */
export function registerProcessMetrics(registry: Registry): void {
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const started = Date.now() / 1000;
  registry.counterFrom('process_cpu_seconds_total', 'Tempo de CPU do processo (usuário + sistema).', () => {
    const u = process.cpuUsage();
    return (u.user + u.system) / 1e6;
  });
  registry.gauge('process_resident_memory_bytes', 'Memória residente.', () => process.memoryUsage().rss);
  registry.gauge('nodejs_heap_used_bytes', 'Heap usado do V8.', () => process.memoryUsage().heapUsed);
  registry.gauge('process_start_time_seconds', 'Início do processo (epoch).', () => started);
  registry.gauge('nodejs_eventloop_delay_p99_seconds', 'p99 do atraso do event loop desde a última coleta.', () => {
    const v = delay.percentile(99) / 1e9;
    delay.reset();
    return v;
  });
}

/** Confere o token de /metrics (`Authorization: Bearer ...`); sem token configurado, aberto. */
export function metricsAuthorized(token: string | undefined, authorization: string | undefined): boolean {
  if (!token) return true;
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(authorization ?? ''), digest(`Bearer ${token}`));
}
