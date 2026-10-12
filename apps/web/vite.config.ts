// SPDX-License-Identifier: GPL-2.0-or-later
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Os assets convertidos (`pnpm assets`) ficam em public/assets e são servidos como estão.
export default defineConfig({
  plugins: [react()],
  build: { target: 'es2023', sourcemap: true },
});
