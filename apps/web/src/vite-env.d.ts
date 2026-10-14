// SPDX-License-Identifier: GPL-2.0-or-later
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço público do código-fonte (GPL); sem ele, o link aponta para a página /source. */
  readonly VITE_SOURCE_URL?: string;
  /** Servidor de jogo (ws:// ou wss://); padrão: porta 7700 da mesma máquina. */
  readonly VITE_GAME_SERVER?: string;
  /** Endereço da API da plataforma (padrão: /api no mesmo domínio). */
  readonly VITE_API_URL?: string;
  /** DSN do serviço de erros (Sentry/GlitchTip, OG-102); sem ele, nada é enviado. */
  readonly VITE_SENTRY_DSN?: string;
  /** Versão do build, enviada junto dos erros. */
  readonly VITE_RELEASE?: string;
}
