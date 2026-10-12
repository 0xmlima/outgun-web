// SPDX-License-Identifier: GPL-2.0-or-later
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Só o código novo do port é analisado; o original e os artefatos gerados ficam de fora.
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      'src/**',
      'doc/**',
      'plan/**',
      'node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Permite descartar campos com desestruturação: const { a, ...resto } = obj.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    // packages/sim roda no navegador e no Node: nada de APIs de plataforma nem aleatoriedade global.
    files: ['packages/sim/src/**/*.ts'],
    languageOptions: {
      globals: {},
    },
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'process',
          'Buffer',
          'require',
          'setTimeout',
          'setInterval',
          'performance',
        ].map((name) => ({
          name,
          message: 'packages/sim deve ser puro e portável (sem APIs de Node/DOM).',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^node:',
              message: 'packages/sim não pode importar módulos do Node.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use o Rng injetado (determinismo e paridade com o original).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'A simulação mede tempo em frames, não em relógio de parede.',
        },
      ],
    },
  },
);
