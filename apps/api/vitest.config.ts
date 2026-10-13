// SPDX-License-Identifier: GPL-2.0-or-later
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./src/test/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 90_000,
  },
});
