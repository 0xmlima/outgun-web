// SPDX-License-Identifier: GPL-2.0-or-later
// Celular (D-80, OG-417): só as telas do portal abrem; a partida e o que leva a ela seguem só no
// computador, com um aviso no lugar.

/**
 * Toque sem mouse e tela curta (o lado menor abaixo de 600 px): pega celulares e deixa de fora
 * tablets com teclado e notebooks com toque (OG-209).
 */
export function isPhone(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(pointer: coarse) and (hover: none)').matches && Math.min(screen.width, screen.height) < 600;
}

/** Rotas do portal (RN-UI-08): o resto (partida, salas, replays, opções) mostra o aviso no celular. */
const PORTAL = [
  /^\/$/,
  /^\/(help|credits|source|terms|privacy|about|feedback|admin|ranking|hall-da-fama|players|jogadores|clans|outcup)\/?$/,
  /^\/outcup\/\d{4}-\d{2}\/?$/,
  /^\/(login|register|forgot-password|reset-password)\/?$/,
  /^\/account(\/(password|delete|username|clan-tag))?\/?$/,
  /^\/clans\/[^/]+\/?$/,
  /^\/players\/[^/]+\/?$/,
  /^\/(matches|series)\/[^/]+\/?$/,
  /^\/rooms\/[^/]+\/report\/?$/,
];

export function isPortalPath(pathname: string): boolean {
  return PORTAL.some((re) => re.test(pathname));
}

/** Abas do painel que abrem no celular (OG-427): as de moderação; as de configuração ficam no computador. */
export const PHONE_ADMIN_TABS: ReadonlySet<string> = new Set(['rooms', 'reports', 'clans', 'bans', 'audit', 'feedback']);
