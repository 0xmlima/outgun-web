// SPDX-License-Identifier: GPL-2.0-or-later
import { defineConfig } from 'vitest/config';

// Partidas e replays simulados inteiros: com o turbo rodando todos os pacotes em paralelo (CI sem
// cache), vários testes passam dos 5 s padrão sem estar errados.
export default defineConfig({
  test: { testTimeout: 30_000 },
});
