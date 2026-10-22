// SPDX-License-Identifier: GPL-2.0-or-later
import { translate } from '@outgun/i18n';
import { describe, expect, it } from 'vitest';
import { RATING_RULES } from './rating-help.js';

describe('explicação do rating (OG-342, OpenSkill no OG-351)', () => {
  it('todas as regras do "i" têm tradução em português', () => {
    for (const rule of RATING_RULES) expect(translate('pt-BR', rule)).not.toBe(rule);
  });
});
