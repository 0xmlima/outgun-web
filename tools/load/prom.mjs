// SPDX-License-Identifier: GPL-2.0-or-later
// Leitura do formato texto do Prometheus e quantis de histograma entre duas coletas (OG-101).

/** `nome{a="b"} 1.5` → [{ name, labels, value }]. */
export function parseMetrics(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})? (\S+)$/.exec(line);
    if (!m) continue;
    const labels = {};
    for (const [, k, v] of (m[2] ?? '').matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g))
      labels[k] = v.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c));
    out.push({ name: m[1], labels, value: m[3] === '+Inf' ? Infinity : Number(m[3]) });
  }
  return out;
}

/** Soma das séries com esse nome cujos rótulos batem com `match`. */
export function sum(samples, name, match = {}) {
  return samples
    .filter((s) => s.name === name && Object.entries(match).every(([k, v]) => s.labels[k] === v))
    .reduce((a, s) => a + s.value, 0);
}

/** Histograma (faixas acumuladas) somado entre as séries; `before` desconta uma coleta anterior. */
export function histogram(after, name, before = []) {
  const collect = (samples) => {
    const buckets = new Map();
    for (const s of samples)
      if (s.name === `${name}_bucket`)
        buckets.set(
          Number(s.labels.le === '+Inf' ? Infinity : s.labels.le),
          (buckets.get(Number(s.labels.le === '+Inf' ? Infinity : s.labels.le)) ?? 0) + s.value,
        );
    return { buckets, count: sum(samples, `${name}_count`), sum: sum(samples, `${name}_sum`) };
  };
  const a = collect(after);
  const b = collect(before);
  const les = [...a.buckets.keys()].sort((x, y) => x - y);
  return {
    buckets: les.map((le) => [le, (a.buckets.get(le) ?? 0) - (b.buckets.get(le) ?? 0)]),
    count: a.count - b.count,
    sum: a.sum - b.sum,
  };
}

/** Quantil como o `histogram_quantile` (interpolação linear dentro da faixa). */
export function quantile(h, q) {
  if (h.count === 0) return 0;
  const rank = q * h.count;
  let prevLe = 0;
  let prevCount = 0;
  for (const [le, count] of h.buckets) {
    if (count >= rank) {
      if (le === Infinity) return prevLe;
      return prevLe + (le - prevLe) * ((rank - prevCount) / Math.max(1, count - prevCount));
    }
    prevLe = le;
    prevCount = count;
  }
  return prevLe;
}

/** Fração das observações até `le` (exato quando `le` é uma faixa do histograma). */
export function fractionAtMost(h, le) {
  const bucket = h.buckets.find(([b]) => b >= le);
  return h.count === 0 || !bucket ? 1 : bucket[1] / h.count;
}
