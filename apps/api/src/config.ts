// SPDX-License-Identifier: GPL-2.0-or-later
// Configuração por variáveis de ambiente (ver apps/api/README.md).

export interface ApiConfig {
  port: number;
  host: string;
  databaseUrl: string;
  /** Vazio = sem Redis (desenvolvimento e testes). */
  redisUrl: string | undefined;
  /** serverId → segredos HMAC aceitos (mais de um durante a rotação de chave). */
  internalSecrets: Map<string, string[]>;
  /** Diferença máxima entre o relógio do game server e o da API. */
  internalMaxSkewMs: number;
  logLevel: string;
}

/** INTERNAL_SECRETS="gs-1:segredo,gs-2:novo|antigo" */
export function parseSecrets(value: string | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of (value ?? '').split(',')) {
    const at = entry.indexOf(':');
    if (at <= 0) continue;
    const secrets = entry
      .slice(at + 1)
      .split('|')
      .filter((s) => s.length >= 16);
    if (secrets.length > 0) map.set(entry.slice(0, at).trim(), secrets);
  }
  return map;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: Number(env.PORT ?? 7800),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? 'postgres://outgun:outgun@localhost:5432/outgun',
    redisUrl: env.REDIS_URL || undefined,
    internalSecrets: parseSecrets(env.INTERNAL_SECRETS ?? (env.NODE_ENV === 'production' ? '' : 'dev:outgun-dev-secret-0000')),
    internalMaxSkewMs: Number(env.INTERNAL_MAX_SKEW_S ?? 30) * 1000,
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
