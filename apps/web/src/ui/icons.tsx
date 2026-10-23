// SPDX-License-Identifier: GPL-2.0-or-later
// Ícones dos menus (OG-291): 24×24, traço de 2 px e pontas retas, desenhados com as formas da partida
// (o círculo do jogador com o cano, a bandeira com mastro, as salas do minimapa). Herdam a cor do texto.
import { ALL_COLORS, colourKey, EXTRA_COLOUR_DEFAULTS } from '@outgun/protocol';

const PATHS = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  flag: (
    <>
      <path d="M6 21V3" />
      <path d="M7 4h11v8H7" fill="currentColor" fillOpacity=".25" />
    </>
  ),
  rooms: <path d="M3 4h7v6.5M14 4h7v7M3 14v6h7M21 14v6h-7M3 4v6M10 14v6M14 14h7" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 14.5v2.5" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H3.5v1.5A3.5 3.5 0 0 0 7 11M17 6h3.5v1.5A3.5 3.5 0 0 1 17 11M12 14v4M8 21h8M9 18h6" />
    </>
  ),
  player: (
    <>
      <circle cx="10" cy="13" r="6" />
      <path d="M14.2 8.8 20 3" />
    </>
  ),
  players: (
    <>
      <circle cx="8" cy="14" r="4.5" />
      <circle cx="16.5" cy="9.5" r="4.5" />
      <path d="M11 10.8l2.2-1.3" />
    </>
  ),
  clan: (
    <>
      <path d="M12 3 4 6v6c0 4.5 3.4 7.6 8 9 4.6-1.4 8-4.5 8-9V6z" />
      <path d="M9 9v7M9 9h6l-1.5 2 1.5 2H9" />
    </>
  ),
  replay: (
    <>
      <path d="M4 12a8 8 0 1 0 2.6-5.9" />
      <path d="M4 3v5h5" />
      <path d="M10.5 9v6l5-3z" fill="currentColor" stroke="none" />
    </>
  ),
  options: <path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h11M19 18h1M14 4v4M7 10v4M15 16v4" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5M12 17v.5" />
    </>
  ),
  credits: <path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M4 15v5h16v-5" />,
  feedback: <path d="M4 5h16v11H11l-5 4v-4H4zM8 10.5h.5M12 10.5h.5M16 10.5h.5" />,
  account: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4 21c1-4.5 4.4-6.5 8-6.5s7 2 8 6.5" />
    </>
  ),
  // notificações (OG-361)
  bell: <path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" />,
  shield: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** As cores de jogador de fábrica: as 16 do original (src/colour_def.inc), as 16 novas e as medalhas (OG-411). */
export const PLAYER_COLOURS: readonly string[] = [
  '#00FF00', '#FFFF00', '#FFFFFF', '#FF08FF', '#00FFFF', '#FFA000', '#FF5544', '#4455FF',
  '#008000', '#A0A0A0', '#00A0A0', '#800080', '#A06000', '#000080', '#800000', '#666666',
  ...Array.from({ length: ALL_COLORS - 16 }, (_, i) => EXTRA_COLOUR_DEFAULTS[colourKey(16 + i)]!),
];

/** O jogador como aparece na partida: miolo na cor pessoal, anel (e cano) na cor do time. */
export function PlayerAvatar({ colour, ring = 'var(--avatar-ring, var(--accent))', size = 28 }: { colour: string; ring?: string; size?: number }) {
  return (
    <svg className="ui-player-avatar" width={size} height={size} viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <line x1="13" y1="13" x2="22.6" y2="5" stroke={ring} strokeWidth="2.4" />
      <circle cx="13" cy="13" r="8" fill={colour} stroke={ring} strokeWidth="3.2" />
    </svg>
  );
}
