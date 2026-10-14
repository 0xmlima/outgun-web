// SPDX-License-Identifier: GPL-2.0-or-later
// Ambiente dos testes E2E (OG-101): API (17800), game server (17700) e o build do cliente servido
// pelo `vite preview` (14173), em portas próprias para não brigar com o desenvolvimento. O game
// server confere tickets de verdade (DEV_TICKETS=0) e as partidas duram 1 minuto (time_limit 1).
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const database = process.env.E2E_DATABASE_URL ?? 'postgres://outgun:outgun@localhost:55433/outgun';
// E2E_BASE_URL: roda contra um ambiente já no ar (homologação, deploy/staging.sh) em vez de subir os serviços
const external = process.env.E2E_BASE_URL;
const web = external ?? 'http://localhost:14173';

export default defineConfig({
  testDir: 'tests',
  globalSetup: './global-setup.mjs',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: '../parity/out/e2e/report' }]]
    : 'list',
  outputDir: '../parity/out/e2e/results',
  use: {
    baseURL: web,
    // localmente usa o Chrome instalado; no CI, o Chromium do Playwright
    ...(process.env.CI ? {} : { channel: 'chrome' }),
    viewport: { width: 1024, height: 768 },
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: external
    ? []
    : [
        {
          name: 'api',
          command: `node ${repo}apps/api/dist/main.js`,
          url: 'http://localhost:17800/health',
          env: {
            PORT: '17800',
            DATABASE_URL: database,
            MAILER: 'memory',
            DEV_ROUTES: '1',
            WEB_URL: web,
            DEV_ROOM_WS_URL: 'ws://localhost:17700/rooms/{id}',
            LOG_LEVEL: 'warn',
          },
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          name: 'game-server',
          command: `node ${repo}apps/game-server/dist/main.js`,
          url: 'http://localhost:17700/health',
          env: {
            PORT: '17700',
            API_URL: 'http://localhost:17800',
            TICKET_JWKS_URL: 'http://localhost:17800/.well-known/jwks.json',
            PUBLIC_WS_URL: 'ws://localhost:17700',
            DEV_TICKETS: '0',
            ROTATION: '2 versus 2 (duel)',
            CASUAL_BOTS_FILL: '3',
            GAMEMOD: 'time_limit 1|game_end_delay 3',
            REPLAYS: '0',
            LOG_LEVEL: 'warn',
          },
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          name: 'web',
          command: `pnpm --filter @outgun/web exec vite preview --port 14173 --strictPort`,
          cwd: repo,
          url: web,
          env: { API_URL: 'http://localhost:17800' },
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ],
});
