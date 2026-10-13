// SPDX-License-Identifier: GPL-2.0-or-later
// apps/api/openapi.json é a especificação publicada: tem de bater com as rotas. Para atualizar:
// pnpm --filter @outgun/api build && pnpm --filter @outgun/api openapi
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connect } from './db/client.js';

it('openapi.json está atualizado', async () => {
  const config = loadConfig({});
  const database = connect(config.databaseUrl, 1); // o cliente só conecta na primeira consulta
  const app = await buildApp({ config, database, logger: false });
  await app.ready();
  const published = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'));
  expect(published).toEqual(JSON.parse(JSON.stringify(app.swagger())));
  await app.close();
  await database.close();
});
