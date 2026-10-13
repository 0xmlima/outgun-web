// SPDX-License-Identifier: GPL-2.0-or-later
import { Redis } from 'ioredis';

/** Cliente Redis ou undefined sem REDIS_URL. Não derruba a API se o Redis cair: /health avisa. */
export function connectRedis(url: string | undefined): Redis | undefined {
  if (!url) return undefined;
  return new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2, enableOfflineQueue: false });
}
