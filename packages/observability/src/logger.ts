// SPDX-License-Identifier: GPL-2.0-or-later
// Logs estruturados (pino, JSON por linha) com os mesmos campos em todos os serviços: `service`,
// `env`, `version` e, por contexto, `room`, `reqId` ou `jti` (o ticket liga o pedido na API à
// entrada no game server). Segredos são mascarados.
import { randomUUID } from 'node:crypto';
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

/** Campos que nunca vão para o log. */
export const REDACT_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'ticket',
  'token',
  'secret',
  'authorization',
  'cookie',
  '*.password',
  '*.ticket',
  '*.token',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-outgun-signature"]',
  'res.headers["set-cookie"]',
];

export interface LoggerConfig {
  service: string;
  level?: string;
  version?: string;
  env?: string;
}

/** Opções do pino (também usadas pelo Fastify da API). */
export function loggerOptions(config: LoggerConfig): LoggerOptions {
  return {
    level: config.level ?? 'info',
    base: { service: config.service, env: config.env ?? process.env.NODE_ENV ?? 'development', ...(config.version ? { version: config.version } : {}) },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    formatters: { level: (label) => ({ level: label }) },
  };
}

export function createLogger(config: LoggerConfig, destination?: DestinationStream): Logger {
  return destination ? pino(loggerOptions(config), destination) : pino(loggerOptions(config));
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Id de correlação: aproveita o `x-request-id` recebido se for bem formado. */
export function requestId(incoming: string | string[] | undefined): string {
  const v = Array.isArray(incoming) ? incoming[0] : incoming;
  return v && REQUEST_ID.test(v) ? v : randomUUID();
}
