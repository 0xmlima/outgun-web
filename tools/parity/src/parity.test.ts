// SPDX-License-Identifier: GPL-2.0-or-later
import { join } from 'node:path';
import type { Rng } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import {
  firstDifference,
  formatFailure,
  listTraces,
  loadTrace,
  runParity,
  TRACES_DIR,
  type SimAdapter,
  type Trace,
  type TraceState,
} from './index.js';

const traces = new Map(listTraces().map((name) => [name, loadTrace(join(TRACES_DIR, `${name}.jsonl.gz`))]));
const clone = <T>(value: T): T => structuredClone(value);

/** "Simulação" que devolve exatamente o resultado gravado: valida o próprio harness. */
class ReplayAdapter implements SimAdapter {
  private frame = 0;
  constructor(
    private readonly trace: Trace,
    private readonly tamper?: (state: TraceState) => void,
    private readonly randToConsume?: (recorded: number) => number,
  ) {}
  setup(): void {}
  load(state: TraceState): void {
    this.frame = state.frame;
  }
  step(rng: Rng): TraceState {
    const recorded = this.trace.frames.find((f) => f.frame === this.frame)!;
    const count = this.randToConsume ? this.randToConsume(recorded.rand.length) : recorded.rand.length;
    for (let i = 0; i < count; i++) rng.rand();
    const post = clone(recorded.post);
    this.tamper?.(post);
    this.frame++;
    return post;
  }
}

describe('golden traces gravados', () => {
  it('há pelo menos 10 cenários', () => {
    expect(traces.size).toBeGreaterThanOrEqual(10);
  });

  for (const [name, trace] of traces) {
    it(`${name}: estrutura consistente`, () => {
      expect(trace.frames.length).toBeGreaterThan(0);
      trace.frames.forEach((frame, i) => {
        expect(frame.frame).toBe(trace.header.startFrame + i);
        expect(frame.pre.frame).toBe(frame.frame);
        expect(frame.post.frame).toBe(frame.frame);
        // ServerWorld::simulateFrame embaralha os jogadores com random_shuffle: n - 1 chamadas a rand().
        expect(frame.rand.length).toBeGreaterThanOrEqual(Math.max(0, frame.pre.players.length - 1));
      });
    });

    it(`${name}: o harness aceita a própria gravação`, () => {
      const result = runParity(trace, new ReplayAdapter(trace));
      expect(result.failure, formatFailure(name, result)).toBeUndefined();
      expect(result.framesChecked).toBe(trace.frames.length);
    });
  }
});

describe('detecção de divergências', () => {
  const trace = traces.get('move-straight')!;
  const target = trace.header.startFrame + 30;

  it('aponta o primeiro frame e o campo divergente', () => {
    const adapter = new ReplayAdapter(trace, (state) => {
      if (state.frame >= target) state.players.find((p) => p.pid === 0)!.vel[0] += 1e-6;
    });
    const result = runParity(trace, adapter);
    expect(result.failure?.frame).toBe(target);
    expect(result.failure?.difference.path).toBe('players[pid=0].vel[0]');
    expect(result.framesChecked).toBe(30);
    expect(formatFailure('move-straight', result)).toContain('divergência no frame');
  });

  it('respeita a tolerância e o recorte de campos', () => {
    const adapter = new ReplayAdapter(trace, (state) => {
      state.players.find((p) => p.pid === 0)!.vel[0] += 1e-12;
      state.teams[0].score += 1;
    });
    const select = (s: TraceState) => s.players.map((p) => ({ pid: p.pid, vel: p.vel }));
    expect(runParity(trace, adapter, { select }).failure).toBeUndefined();
    expect(runParity(trace, adapter).failure?.difference.path).toBe('teams[0].score');
  });

  it('acusa rand() consumidos a menos ou a mais', () => {
    const fewer = runParity(trace, new ReplayAdapter(trace, undefined, (n) => n - 1));
    expect(fewer.failure?.difference.path).toBe('rand.consumidos');
    const more = runParity(trace, new ReplayAdapter(trace, undefined, (n) => n + 1));
    expect(more.failure?.difference.path).toBe('(exceção)');
    expect(String(more.failure?.difference.actual)).toContain('mais rand()');
  });
});

describe('firstDifference', () => {
  it('aplica a tolerância absoluta a todos os números', () => {
    expect(firstDifference({ x: 102 }, { x: 102 + 1e-12 })).toBeUndefined();
    expect(firstDifference({ x: 0.5 }, { x: 0.5 + 1e-6 })).toEqual({ path: 'x', expected: 0.5, actual: 0.5 + 1e-6 });
    expect(firstDifference({ frags: 3 }, { frags: 4 })?.path).toBe('frags');
    expect(firstDifference({ x: 0.5 }, { x: 0.5 + 1e-6 }, { tolerance: 1e-3 })).toBeUndefined();
  });

  it('compara entidades por chave e detecta ausentes/extras', () => {
    const p = (pid: number, x: number) => ({ pid, x });
    expect(firstDifference({ players: [p(0, 1), p(8, 2)] }, { players: [p(8, 2), p(0, 1)] })).toBeUndefined();
    expect(firstDifference({ players: [p(0, 1)] }, { players: [] })?.path).toBe('players[pid=0]');
    expect(firstDifference({ players: [] }, { players: [p(3, 1)] })?.path).toBe('players[pid=3]');
  });
});
