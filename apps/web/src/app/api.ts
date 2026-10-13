// SPDX-License-Identifier: GPL-2.0-or-later
// Cliente da API da plataforma (apps/api). Em desenvolvimento e no preview, o Vite repassa /api para
// a API (porta 7800); em produção, VITE_API_URL ou o mesmo domínio em /api.

export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Segundos até poder tentar de novo (429). */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      credentials: 'include',
      headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
      body: init.body === undefined ? null : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'network', 'network error');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    const retry = Number(res.headers.get('retry-after'));
    throw new ApiError(res.status, data.error ?? 'unknown', data.message ?? res.statusText, retry > 0 ? retry : undefined);
  }
  return data as T;
}
