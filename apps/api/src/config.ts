// SPDX-License-Identifier: GPL-2.0-or-later
// Configuração por variáveis de ambiente (ver apps/api/README.md).
import { parseSecrets } from '@outgun/tickets';

export { parseSecrets };

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
  /** Exige `Authorization: Bearer <token>` em /metrics (OG-102). */
  metricsToken: string | undefined;
  /** DSN do serviço de erros (Sentry/GlitchTip); vazio desliga. */
  sentryDsn: string | undefined;
  /** Ambiente e versão nos logs e nos erros. */
  environment: string;
  release: string | undefined;
  /** Confiar em X-Forwarded-For (só atrás de um proxy reverso). */
  trustProxy: boolean;
  /** Endereço do cliente web (links dos e-mails). */
  webUrl: string;
  /** Origens aceitas em pedidos que mudam estado (proteção CSRF). */
  webOrigins: string[];
  cookieSecure: boolean;
  sessionTtlMs: number;
  mailer: 'log' | 'memory' | 'mailpit' | 'resend';
  mailpitUrl: string;
  resendApiKey: string | undefined;
  mailFrom: string;
  /** Rotas de depuração (caixa de saída do MAILER=memory). Nunca em produção. */
  devRoutes: boolean;
  /** TICKET_SIGNING_KEYS (kid:base64pkcs8,...): a primeira assina. Vazio fora de produção = chave gerada na partida. */
  ticketSigningKeys: string;
  /** Endereço do game server quando a sala ainda não mandou heartbeat ({id} = sala). Nunca em produção. */
  devRoomWsUrl: string | undefined;
  limits: {
    /** Falhas de senha por nome de usuário antes da espera (RN-PLT-06). */
    loginFailuresPerUser: number;
    /** Falhas de senha por IP (qualquer usuário) antes da espera. */
    loginFailuresPerIp: number;
    registerPerHourPerIp: number;
    forgotPerHourPerIp: number;
    /** Tentativas de senha de sala privada por IP e sala. */
    joinPasswordPerMinute: number;
    /** Salas privadas criadas por conta por hora. */
    roomsPerHourPerUser: number;
  };
}

const MAILERS = ['log', 'memory', 'mailpit', 'resend'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const production = env.NODE_ENV === 'production';
  const webUrl = (env.WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  const mailer = MAILERS.find((m) => m === env.MAILER) ?? (production ? 'resend' : 'log');
  return {
    port: Number(env.PORT ?? 7800),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? 'postgres://outgun:outgun@localhost:5432/outgun',
    redisUrl: env.REDIS_URL || undefined,
    internalSecrets: parseSecrets(env.INTERNAL_SECRETS ?? (env.NODE_ENV === 'production' ? '' : 'dev:outgun-dev-secret-0000')),
    internalMaxSkewMs: Number(env.INTERNAL_MAX_SKEW_S ?? 30) * 1000,
    logLevel: env.LOG_LEVEL ?? 'info',
    metricsToken: env.METRICS_TOKEN || undefined,
    sentryDsn: env.SENTRY_DSN || undefined,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV ?? 'development',
    release: env.RELEASE || undefined,
    trustProxy: env.TRUST_PROXY === '1',
    webUrl,
    webOrigins: (env.WEB_ORIGINS ?? `${webUrl},http://localhost:5173,http://localhost:4173`)
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : production,
    sessionTtlMs: Number(env.SESSION_TTL_DAYS ?? 30) * 24 * 60 * 60_000,
    mailer,
    mailpitUrl: env.MAILPIT_URL ?? 'http://localhost:8025',
    resendApiKey: env.RESEND_API_KEY || undefined,
    mailFrom: env.MAIL_FROM ?? 'no-reply@outgun.local',
    devRoutes: !production && env.DEV_ROUTES === '1',
    ticketSigningKeys: env.TICKET_SIGNING_KEYS ?? '',
    devRoomWsUrl: production ? undefined : (env.DEV_ROOM_WS_URL ?? 'ws://localhost:7700/rooms/{id}'),
    limits: {
      loginFailuresPerUser: 5,
      loginFailuresPerIp: Number(env.LOGIN_FAILURES_PER_IP ?? 10),
      registerPerHourPerIp: Number(env.REGISTER_PER_HOUR ?? 10),
      forgotPerHourPerIp: Number(env.FORGOT_PER_HOUR ?? 10),
      joinPasswordPerMinute: 10,
      roomsPerHourPerUser: Number(env.ROOMS_PER_HOUR ?? 10),
    },
  };
}
