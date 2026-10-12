// SPDX-License-Identifier: GPL-2.0-or-later
// Paridade do movimento (OG-021): a simulação TS contra os golden traces do original.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatFailure, loadTrace, movementFields, runParity, SimTraceAdapter, TRACES_DIR } from './index.js';

const MOVEMENT = ['move-straight', 'move-run', 'move-diagonal', 'move-brake-turn', 'move-turbo', 'bounce-triangle', 'bounce-circle', 'wrap-edge'];

describe('movimento x original', () => {
  for (const name of MOVEMENT) {
    const trace = loadTrace(join(TRACES_DIR, `${name}.jsonl.gz`));
    for (const mode of ['resync', 'free'] as const) {
      it(`${name} (${mode})`, () => {
        const result = runParity(trace, new SimTraceAdapter(), { mode, select: movementFields, checkRandCount: false });
        expect(result.failure, formatFailure(name, result)).toBeUndefined();
        expect(result.framesChecked).toBe(trace.frames.length);
      });
    }
  }
});
