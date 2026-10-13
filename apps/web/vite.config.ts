// SPDX-License-Identifier: GPL-2.0-or-later
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// /api vai para a API da plataforma (apps/api, porta 7800) no dev e no preview: mesma origem para o
// cookie de sessão. API_URL muda o destino.
const proxy = {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:7800',
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

// Os assets convertidos (`pnpm assets`) ficam em public/assets e são servidos como estão.
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  build: { target: 'es2023', sourcemap: true },
});
