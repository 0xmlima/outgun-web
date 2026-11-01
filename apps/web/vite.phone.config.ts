// SPDX-License-Identifier: GPL-2.0-or-later
// Cliente de desenvolvimento pelo ngrok, para testar no celular e no tablet (DEVELOPMENT.md, "Celular e
// tablet pelo ngrok"): porta 5174, aceita o host do túnel e repassa /gs para o WebSocket do game server.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';

export default mergeConfig(
  base,
  defineConfig({
    server: {
      port: 5174,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/gs': {
          target: 'ws://localhost:7700',
          ws: true,
          rewrite: (path: string) => path.replace(/^\/gs/, ''),
        },
      },
    },
  }),
);
