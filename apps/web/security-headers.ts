// SPDX-License-Identifier: GPL-2.0-or-later
// Cabeçalhos de segurança do cliente web (OG-104): o `vite preview` usa estes e o servidor de
// produção (OG-103) tem de mandar os mesmos. CSP sem 'unsafe-inline' em scripts nem 'unsafe-eval'
// (o PixiJS usa `pixi.js/unsafe-eval`, que não depende de eval). `connect` lista os endereços de API,
// game servers (WebSocket e /health do ping), replays e serviço de erros.

/** Origens extras de `connect-src` para o desenvolvimento local (game server e API em outras portas). */
export const LOCAL_CONNECT = [
  'http://localhost:*',
  'ws://localhost:*',
  'http://127.0.0.1:*',
  'ws://127.0.0.1:*',
];

export function contentSecurityPolicy(connect: readonly string[]): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React e o PixiJS põem estilos inline (atributo style)
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src 'self' ${connect.join(' ')}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders(connect: readonly string[]): Record<string, string> {
  return {
    'content-security-policy': contentSecurityPolicy(connect),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
}
