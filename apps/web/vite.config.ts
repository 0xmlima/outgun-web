// SPDX-License-Identifier: GPL-2.0-or-later
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { LOCAL_CONNECT, securityHeaders } from './security-headers.js';

// /api vai para a API da plataforma (apps/api, porta 7800) no dev e no preview: mesma origem para o
// cookie de sessão. API_URL muda o destino.
const proxy = {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:7800',
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

// versão do jogo (OG-280): a do package.json, que `tools/dev/version.mjs` sobe a cada sprint
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Os assets convertidos (`pnpm assets`) ficam em public/assets e são servidos como estão.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { proxy },
  // o preview serve o build com os cabeçalhos de produção (CSP etc., OG-104); CSP_CONNECT_SRC
  // (separado por espaços) troca as origens locais pelas do ambiente
  preview: {
    proxy,
    headers: securityHeaders(
      process.env.CSP_CONNECT_SRC?.split(/\s+/).filter(Boolean) ?? LOCAL_CONNECT,
    ),
  },
  build: { target: 'es2023', sourcemap: true },
});
