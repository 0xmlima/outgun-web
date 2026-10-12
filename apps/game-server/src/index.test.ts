// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { describeServer } from './index.js';

it('usa os pacotes compartilhados do workspace', () => {
  expect(describeServer()).toBe('outgun game-server (protocolo v1, 10 Hz)');
});
