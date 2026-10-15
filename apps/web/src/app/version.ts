// SPDX-License-Identifier: GPL-2.0-or-later
// Versão do jogo no cliente (OG-280) e aviso de página antiga: depois de um deploy, a API responde
// outra versão em /health e o rodapé oferece recarregar.
import { useEffect, useState } from 'react';
import { api } from './api.js';

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** Releitura do /health: a cada 5 min e ao voltar para a aba. */
const CHECK_MS = 5 * 60_000;

/** A página é mais velha que a API (só compara versões `x.y.z`; em dev nada é avisado). */
export function isOutdated(client: string, server: string | undefined): boolean {
  const semver = /^\d+\.\d+\.\d+$/;
  if (!server || !semver.test(client) || !semver.test(server)) return false;
  const [a, b] = [client, server].map((v) => v.split('.').map(Number)) as [number[], number[]];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number);
  return false;
}

/** Versão que a API está rodando, ou undefined antes da primeira resposta. */
export function useServerVersion(): string | undefined {
  const [version, setVersion] = useState<string>();
  useEffect(() => {
    let alive = true;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      api<{ version?: string }>('/health').then(
        (h) => alive && setVersion(h.version),
        () => undefined,
      );
    };
    check();
    const id = setInterval(check, CHECK_MS);
    addEventListener('visibilitychange', check);
    return () => {
      alive = false;
      clearInterval(id);
      removeEventListener('visibilitychange', check);
    };
  }, []);
  return version;
}
