// SPDX-License-Identifier: GPL-2.0-or-later
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço público do código-fonte (GPL); sem ele, o link aponta para a página /source. */
  readonly VITE_SOURCE_URL?: string;
}
