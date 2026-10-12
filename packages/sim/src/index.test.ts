// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { FRAME_SECONDS, FRAMES_PER_SECOND, secondsToFrames } from './index.js';

describe('unidades de tempo', () => {
  it('um frame dura 0,1 s', () => {
    expect(FRAME_SECONDS * FRAMES_PER_SECOND).toBe(1);
  });

  it('converte segundos em frames', () => {
    expect(secondsToFrames(2)).toBe(20);
    expect(secondsToFrames(0.5)).toBe(5);
  });
});
