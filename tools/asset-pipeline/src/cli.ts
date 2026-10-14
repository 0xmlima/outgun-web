// SPDX-License-Identifier: GPL-2.0-or-later
// Uso: pnpm assets [saída]   (padrão: apps/web/public/assets)
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssets } from './pipeline.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const outDir = process.argv[2] ?? join(repoRoot, 'apps/web/public/assets');
const manifest = buildAssets(join(repoRoot, '_legacy'), outDir, join(repoRoot, 'songs'));
const graphics = Object.values(manifest.graphics).reduce((n, t) => n + Object.keys(t.graphics).length, 0);
const samples = Object.values(manifest.sounds).reduce((n, s) => n + Object.values(s.samples).filter(Boolean).length, 0);
console.log(`${graphics} imagens em ${Object.keys(manifest.graphics).length} temas; ${samples} samples com som.`);
console.log(`${manifest.music.length} faixas de música (${manifest.music.filter((m) => m.role === 'menu').length} de menu).`);
console.log(`manifesto: ${join(outDir, 'manifest.json')}  prévia: ${join(outDir, 'preview.html')}`);
