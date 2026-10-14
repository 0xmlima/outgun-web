// SPDX-License-Identifier: GPL-2.0-or-later
// Observabilidade dos serviços Node (OG-102). O envio de erros também roda no navegador: o cliente
// web importa `@outgun/observability/errors`.
export * from './metrics.js';
export * from './logger.js';
export * from './errors.js';
