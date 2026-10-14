// SPDX-License-Identifier: GPL-2.0-or-later
// Gera o trecho de Caddyfile com os cabeçalhos de segurança do cliente (OG-104) a partir de
// apps/web/security-headers.ts, a mesma fonte do `vite preview`: produção e testes não divergem.
// `connect-src` vem da variável CSP_CONNECT_SRC do contêiner (domínios da API, game servers e erros).
// Uso: node --experimental-strip-types deploy/web/caddy-headers.mjs > security-headers.caddy
import { securityHeaders } from '../../apps/web/security-headers.ts';

const lines = Object.entries(securityHeaders(['{$CSP_CONNECT_SRC}'])).map(
  ([name, value]) => `\t${name} "${value.replace(/"/g, '\\"')}"`,
);
console.log(['header {', ...lines, '\t-server', '}'].join('\n'));
