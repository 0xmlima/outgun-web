// SPDX-License-Identifier: GPL-2.0-or-later
// Fronteira do bot do Casual (OG-513, D-87, RN-TRN-08): nenhum arquivo dele importa algo do treino.
// Só o índice do pacote exporta o `TrainingRobot`; o caminho contrário (treino → Casual) é livre.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = fileURLToPath(new URL('..', import.meta.url));
const casualFiles = readdirSync(src).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');

describe('bot do Casual não conhece o treino (OG-513)', () => {
  it.each(casualFiles)('%s', (file) => {
    const text = readFileSync(`${src}/${file}`, 'utf8');
    expect(text).not.toMatch(/from '\.\/training\//);
    expect(text).not.toMatch(/TrainingRobot|TrainingRole/);
  });

  it('a lista cobre o bot do Casual inteiro', () => {
    expect(casualFiles).toEqual(expect.arrayContaining(['brain.ts', 'combat.ts', 'navigation.ts', 'robot-core.ts', 'situation.ts', 'skill.ts', 'view.ts', 'areamap.ts']));
  });
});
