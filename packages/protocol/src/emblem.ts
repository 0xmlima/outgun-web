// SPDX-License-Identifier: GPL-2.0-or-later
// Emblema do clã (OG-480, D-85, RN-EMB-01/02): moldura + símbolo + detalhes sobre as cores do clã,
// de listas fechadas. `emblemSvg` é o único desenho, usado no portal, no PDF e na partida
// (proposta em `plan/specs/emblema-do-cla/proposta.html`). Quadro de 100 × 100.

export interface ClanEmblem {
  frame: EmblemFrame;
  /** `tag` (a tag do clã como símbolo) ou um desenho do catálogo. */
  symbol: EmblemSymbol;
  /** Filete: contorno interno na cor do símbolo. */
  fillet: boolean;
  /** Troca as cores: secundária no fundo, primária no símbolo. */
  inverted: boolean;
}

/** Molduras: contorno, centro do filete e encaixe do símbolo (escala e deslocamento vertical). */
interface FrameShape {
  d: string;
  cy: number;
  k: number;
  dy: number;
  /** Moldura do hall da fama (OG-488): contorno em metal chapado. */
  metal?: string;
}

const octagon = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    pts.push(`${(50 + 47 * Math.cos(a)).toFixed(1)} ${(50 + 47 * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
})();

const crest = 'M8 20 H30 L40 6 L50 15 L60 6 L70 20 H92 V50 C92 73 74 88 50 96 C26 88 8 73 8 50 Z';

const FRAMES = {
  shield: { d: 'M50 5 L91 15 L91 47 C91 71 73 87 50 96 C27 87 9 71 9 47 L9 15 Z', cy: 48, k: 0.92, dy: -3 },
  circle: { d: 'M50 4 A46 46 0 1 1 49.99 4 Z', cy: 50, k: 0.92, dy: 0 },
  diamond: { d: 'M50 3 L97 50 L50 97 L3 50 Z', cy: 50, k: 0.72, dy: 0 },
  square: { d: 'M20 5 H80 A15 15 0 0 1 95 20 V80 A15 15 0 0 1 80 95 H20 A15 15 0 0 1 5 80 V20 A15 15 0 0 1 20 5 Z', cy: 50, k: 1, dy: 0 },
  octagon: { d: octagon, cy: 50, k: 0.94, dy: 0 },
  banner: { d: 'M9 5 H91 V93 L50 75 L9 93 Z', cy: 44, k: 0.86, dy: -7 },
  none: null,
  // hall da fama de clãs (OG-488, RN-EMB-05): brasão com três pontas, em ouro, prata e bronze
  hallGold: { d: crest, cy: 52, k: 0.8, dy: 3, metal: '#E0B43A' },
  hallSilver: { d: crest, cy: 52, k: 0.8, dy: 3, metal: '#C4CAD4' },
  hallBronze: { d: crest, cy: 52, k: 0.8, dy: 3, metal: '#C07A3E' },
} satisfies Record<string, FrameShape | null>;

export type EmblemFrame = keyof typeof FRAMES;
export const EMBLEM_FRAMES = Object.keys(FRAMES) as EmblemFrame[];
/** Molduras do hall de clãs pela posição que as libera (1º ouro, 2º prata, 3º bronze). */
export const HALL_FRAMES: Readonly<Record<'hallGold' | 'hallSilver' | 'hallBronze', number>> = { hallGold: 1, hallSilver: 2, hallBronze: 3 };

/**
 * Moldura liberada para o clã (RN-EMB-05): as comuns sempre; as do hall pela melhor posição já
 * alcançada no hall de clãs (`best`, null sem pódio), a dela e as de baixo. Permanente.
 */
export function emblemFrameAllowed(frame: EmblemFrame, best: number | null): boolean {
  const needs = (HALL_FRAMES as Record<string, number>)[frame];
  return needs === undefined || (best !== null && best <= needs);
}

/** Desenho de um símbolo: `f` = cor do símbolo, `h` = cor dos vazados. */
type SymbolDraw = (f: string, h: string) => string;

const star = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 11.5 : 27;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
})();
const sword = (f: string) =>
  `<path fill="${f}" d="M50 14 L55 21 L55 62 L45 62 L45 21 Z"/><path fill="${f}" d="M37 62 H63 V68 H37 Z"/><path fill="${f}" d="M47 68 H53 V80 H47 Z"/><circle fill="${f}" cx="50" cy="83" r="4"/>`;
/** Desenho em "pixels" (vetor em degraus): `X` marca um quadrado de lado `u` a partir de (x0, y0). */
function pixels(rows: string[], u: number, x0: number, y0: number): string {
  let d = '';
  rows.forEach((row, r) => {
    for (const m of row.matchAll(/X+/g)) d += `M${x0 + m.index * u} ${y0 + r * u} h${m[0].length * u} v${u} h${-m[0].length * u} Z `;
  });
  return d.trim();
}
const wing = 'M46 42 C36 32 22 30 12 33 C18 37 21 40 22 42 C16 42 13 45 12 48 C20 49 25 51 27 53 C23 55 21 58 21 61 C32 62 41 58 46 53 Z';

/** Catálogo de símbolos (desenhos próprios, centrados em 50, 50). O OG-481 fecha a lista. */
const SYMBOLS = {
  star: (f) => `<polygon fill="${f}" stroke="${f}" stroke-width="3" stroke-linejoin="round" points="${star}"/>`,
  chevrons: (f) => `<path fill="${f}" d="M26 46 L50 28 L74 46 L74 57 L50 39 L26 57 Z"/><path fill="${f}" d="M26 64 L50 46 L74 64 L74 75 L50 57 L26 75 Z"/>`,
  crown: (f, h) =>
    `<path fill="${f}" stroke="${f}" stroke-width="2" stroke-linejoin="round" d="M25 66 L25 36 L38 49 L50 28 L62 49 L75 36 L75 66 Z"/><rect fill="${f}" x="25" y="70" width="50" height="7" rx="2"/><circle fill="${f}" cx="25" cy="34" r="4"/><circle fill="${f}" cx="50" cy="26" r="4"/><circle fill="${f}" cx="75" cy="34" r="4"/><circle fill="${h}" cx="50" cy="56" r="4.5"/>`,
  wings: (f) =>
    `<path fill="${f}" d="${wing}"/><path fill="${f}" transform="translate(100 0) scale(-1 1)" d="${wing}"/><path fill="${f}" d="M50 36 L56 44 L54 66 L50 72 L46 66 L44 44 Z"/>`,
  flag: (f) => `<rect fill="${f}" x="29" y="22" width="6" height="56" rx="2"/><path fill="${f}" d="M35 25 C46 20 55 31 72 25 L72 52 C55 58 46 47 35 52 Z"/><circle fill="${f}" cx="32" cy="21" r="4"/>`,
  crosshair: (f) =>
    `<circle fill="none" stroke="${f}" stroke-width="6" cx="50" cy="50" r="21"/><path fill="${f}" d="M47 20 H53 V39 H47 Z M47 61 H53 V80 H47 Z M20 47 H39 V53 H20 Z M61 47 H80 V53 H61 Z"/><circle fill="${f}" cx="50" cy="50" r="4.5"/>`,
  rocket: (f, h) =>
    `<path fill="${f}" d="M50 18 C61 27 64 42 61 64 L39 64 C36 42 39 27 50 18 Z"/><circle fill="${h}" cx="50" cy="40" r="6"/><path fill="${f}" d="M39 46 L28 64 L28 70 L39 64 Z M61 46 L72 64 L72 70 L61 64 Z"/><path fill="${f}" d="M43 67 L50 82 L57 67 Z"/>`,
  bolt: (f) => `<path fill="${f}" stroke="${f}" stroke-width="2" stroke-linejoin="round" d="M58 18 L30 55 L47 55 L40 82 L70 43 L53 43 L62 18 Z"/>`,
  wolf: (f, h) =>
    `<path fill="${f}" stroke="${f}" stroke-width="2" stroke-linejoin="round" d="M50 80 L38 68 L29 52 L26 20 L42 33 L50 31 L58 33 L74 20 L71 52 L62 68 Z"/><path fill="${h}" d="M35 45 L46 50 L38 54 Z M65 45 L54 50 L62 54 Z"/><path fill="${h}" d="M45 66 L55 66 L50 72 Z"/>`,
  skull: (f, h) =>
    `<path fill="${f}" d="M50 20 C66 20 75 31 75 45 C75 54 70 59 65 61 L65 72 C65 75 63 77 60 77 L40 77 C37 77 35 75 35 72 L35 61 C30 59 25 54 25 45 C25 31 34 20 50 20 Z"/><ellipse fill="${h}" cx="40" cy="47" rx="7" ry="7.5"/><ellipse fill="${h}" cx="60" cy="47" rx="7" ry="7.5"/><path fill="${h}" d="M50 55 L54 62 L46 62 Z"/><path fill="${h}" d="M43 67 H45.5 V77 H43 Z M48.75 67 H51.25 V77 H48.75 Z M54.5 67 H57 V77 H54.5 Z"/>`,
  flame: (f, h) =>
    `<path fill="${f}" d="M50 16 C58 30 72 39 70 58 C69 71 60 80 50 80 C40 80 31 71 30 58 C29 47 36 40 41 31 C43 40 46 45 50 47 C50 38 47 28 50 16 Z"/><path fill="${h}" d="M50 54 C55 61 59 64 58 70 C57 75 54 78 50 78 C46 78 43 75 42 70 C42 64 47 61 50 54 Z"/>`,
  tower: (f, h) =>
    `<path fill="${f}" d="M28 20 H37 V27 H45 V20 H55 V27 H63 V20 H72 V38 L66 42 V72 H72 V80 H28 V72 H34 V42 L28 38 Z"/><path fill="${h}" d="M44 80 V66 A6 6 0 0 1 56 66 V80 Z"/><rect fill="${h}" x="47" y="46" width="6" height="10" rx="3"/>`,
  gem: (f, h) =>
    `<path fill="${f}" stroke="${f}" stroke-width="2" stroke-linejoin="round" d="M34 28 L66 28 L78 44 L50 80 L22 44 Z"/><path fill="none" stroke="${h}" stroke-width="2.5" stroke-linejoin="round" d="M22 44 H78 M41 28 L36 44 L50 80 L64 44 L59 28"/>`,
  swords: (f) => `<g transform="rotate(42 50 50)">${sword(f)}</g><g transform="rotate(-42 50 50)">${sword(f)}</g>`,
  // Pedidos da comunidade (P7 da proposta).
  brokenShield: (f) =>
    `<path fill="${f}" d="M26 24 L47 20 L43 34 L49 46 L42 58 L47 80 C34 74 26 64 26 48 Z"/><path fill="${f}" d="M53 20 L74 24 L74 48 C74 64 66 74 53 80 L48 58 L55 46 L49 34 Z"/>`,
  fist: (f, h) =>
    `<rect fill="${f}" x="29" y="27" width="42" height="39" rx="7"/><path fill="${h}" d="M39 27 h2 v14 h-2 Z M49 27 h2 v14 h-2 Z M59 27 h2 v14 h-2 Z"/><path fill="none" stroke="${h}" stroke-width="2.5" stroke-linecap="round" d="M30 50 H56 C62 50 62 59 56 59 H39"/><rect fill="${f}" x="35" y="69" width="30" height="12" rx="2"/>`,
  wall: (f, h) =>
    `<path fill="${f}" d="M20 24 H32 V33 H44 V24 H56 V33 H68 V24 H80 V79 H20 Z"/><path fill="none" stroke="${h}" stroke-width="2.5" d="M20 47 H80 M20 63 H80 M38 33 V47 M62 33 V47 M29 47 V63 M50 47 V63 M71 47 V63 M38 63 V79 M62 63 V79"/>`,
  phoenix: (f, h) => {
    const w = 'M48 48 C40 36 28 30 16 16 C18 30 24 42 36 52 C30 52 24 50 18 46 C24 56 34 60 46 58 Z';
    const t = 'M47 64 C40 70 37 76 38 85 C42 79 45 76 49 74 Z';
    return `<path fill="${f}" d="${w}"/><path fill="${f}" transform="translate(100 0) scale(-1 1)" d="${w}"/><path fill="${f}" d="${t}"/><path fill="${f}" transform="translate(100 0) scale(-1 1)" d="${t}"/><path fill="${f}" d="M50 37 C56 43 57 53 54 61 L50 80 L46 61 C43 53 44 43 50 37 Z"/><circle fill="${f}" cx="50" cy="30" r="7"/><path fill="${f}" d="M47 24 L50 14 L53 24 Z"/><circle fill="${h}" cx="50" cy="29" r="2"/>`;
  },
  dragon: (f, h) =>
    `<path fill="${f}" stroke="${f}" stroke-width="2" stroke-linejoin="round" d="M22 66 C24 54 30 46 38 42 L30 22 L46 36 L52 20 L58 38 C68 38 78 42 86 48 L66 52 L84 60 C74 66 62 66 54 64 L46 74 L34 82 L36 70 Z"/><path fill="${h}" d="M58 44 L68 45 L60 49 Z"/><circle fill="${h}" cx="80" cy="49" r="1.6"/>`,
  serpent: (f, h) =>
    `<path fill="none" stroke="${f}" stroke-width="9" stroke-linecap="round" d="M30 78 C18 70 26 57 44 55 C62 53 74 45 66 34 C62 28 54 28 50 32"/><ellipse fill="${f}" cx="44" cy="31" rx="10" ry="7.5"/><circle fill="${h}" cx="46" cy="28.5" r="2"/><path fill="none" stroke="${f}" stroke-width="2.2" stroke-linecap="round" d="M34 32 L26 29 M34 32 L27 36"/>`,
  eagle: (f, h) => {
    const w = 'M46 44 L12 32 L18 40 L11 43 L20 48 L15 53 L27 55 L44 58 Z';
    return `<path fill="${f}" d="${w}"/><path fill="${f}" transform="translate(100 0) scale(-1 1)" d="${w}"/><path fill="${f}" d="M50 33 C57 33 59 42 57 52 L59 70 L50 76 L41 70 L43 52 C41 42 43 33 50 33 Z"/><path fill="${f}" d="M43 70 L39 83 L50 78 L61 83 L57 70 Z"/><circle fill="${f}" cx="50" cy="27" r="8"/><path fill="${f}" d="M54 25 L63 30 L54 34 Z"/><circle fill="${h}" cx="52" cy="25" r="1.8"/>`;
  },
  shark: (f, h) =>
    `<path fill="${f}" stroke="${f}" stroke-width="2" stroke-linejoin="round" d="M12 38 L24 52 C34 46 44 43 52 43 L58 25 L66 44 C76 46 84 51 88 56 C82 60 74 63 64 64 L60 73 L54 64 C42 64 32 62 24 58 L12 72 L18 55 Z"/><circle fill="${h}" cx="77" cy="52" r="2.2"/><path fill="none" stroke="${h}" stroke-width="2" stroke-linecap="round" d="M66 51 L64 59 M70 51 L68 59 M77 59 L84 57"/>`,
  spider: (f, h) => {
    const legs = 'M44 44 L30 34 L22 20 M44 48 L26 44 L15 36 M44 54 L26 58 L15 68 M44 58 L32 70 L26 84';
    return `<g fill="none" stroke="${f}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="${legs}"/><path transform="translate(100 0) scale(-1 1)" d="${legs}"/></g><ellipse fill="${f}" cx="50" cy="38" rx="8" ry="7"/><ellipse fill="${f}" cx="50" cy="58" rx="12" ry="14"/><path fill="${h}" d="M50 51 L54 58 L50 65 L46 58 Z"/>`;
  },
  alien: (f, h) =>
    `<path fill="${f}" d="M50 18 C68 18 78 32 76 46 C74 60 60 78 50 82 C40 78 26 60 24 46 C22 32 32 18 50 18 Z"/><path fill="${h}" d="M29 45 C35 39 44 41 46 52 C38 56 31 52 29 45 Z"/><path fill="${h}" transform="translate(100 0) scale(-1 1)" d="M29 45 C35 39 44 41 46 52 C38 56 31 52 29 45 Z"/><rect fill="${h}" x="45" y="68" width="10" height="2.5" rx="1.2"/>`,
  robot: (f, h) =>
    `<rect fill="${f}" x="48" y="20" width="4" height="12"/><circle fill="${f}" cx="50" cy="19" r="4.5"/><rect fill="${f}" x="26" y="32" width="48" height="40" rx="6"/><rect fill="${f}" x="19" y="44" width="7" height="16" rx="2"/><rect fill="${f}" x="74" y="44" width="7" height="16" rx="2"/><rect fill="${f}" x="40" y="72" width="20" height="8"/><circle fill="${h}" cx="39" cy="47" r="6"/><circle fill="${h}" cx="61" cy="47" r="6"/><path fill="${h}" d="M36 59 H44 V66 H36 Z M46 59 H54 V66 H46 Z M56 59 H64 V66 H56 Z"/>`,
  joystick: (f, h) =>
    `<path fill="${f}" d="M20 70 L28 57 H72 L80 70 V79 H20 Z"/><rect fill="${f}" x="47" y="34" width="6" height="26"/><circle fill="${f}" cx="50" cy="30" r="12"/><circle fill="${h}" cx="45" cy="25" r="3.5"/><circle fill="${h}" cx="32" cy="68" r="3.5"/><circle fill="${h}" cx="68" cy="68" r="3.5"/>`,
  ghost: (f, h) =>
    `<path fill="${f}" d="M50 18 C66 18 72 32 72 46 C72 60 76 70 84 78 C72 81 64 77 58 72 C53 79 45 80 40 76 C33 80 26 78 22 72 C28 66 28 56 28 46 C28 32 34 18 50 18 Z"/><ellipse fill="${h}" cx="42" cy="42" rx="4" ry="6.5"/><ellipse fill="${h}" cx="58" cy="42" rx="4" ry="6.5"/><ellipse fill="${h}" cx="50" cy="58" rx="4" ry="5.5"/>`,
  pixelHeart: (f, h) => `<path fill="${f}" d="${pixels(['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'], 8, 22, 27)}"/><rect fill="${h}" x="30" y="35" width="8" height="8"/>`,
} satisfies Record<string, SymbolDraw>;

export type EmblemSymbol = 'tag' | keyof typeof SYMBOLS;
export const EMBLEM_SYMBOLS = ['tag', ...Object.keys(SYMBOLS)] as EmblemSymbol[];

/** Nomes de tela (chave de tradução, em inglês como no resto do jogo). */
export const EMBLEM_FRAME_NAMES: Readonly<Record<EmblemFrame, string>> = {
  shield: 'Shield', circle: 'Circle', diamond: 'Diamond', square: 'Square', octagon: 'Octagon', banner: 'Banner', none: 'No frame',
  hallGold: 'Gold crest', hallSilver: 'Silver crest', hallBronze: 'Bronze crest',
};
export const EMBLEM_SYMBOL_NAMES: Readonly<Record<EmblemSymbol, string>> = {
  tag: 'Tag', star: 'Star', chevrons: 'Chevrons', crown: 'Crown', wings: 'Wings', flag: 'Flag', crosshair: 'Crosshair',
  rocket: 'Rocket', bolt: 'Lightning', wolf: 'Wolf', skull: 'Skull', flame: 'Flame', tower: 'Tower', gem: 'Gem',
  swords: 'Crossed swords', brokenShield: 'Broken shield', fist: 'Fist', wall: 'Wall', phoenix: 'Phoenix', dragon: 'Dragon',
  serpent: 'Serpent', eagle: 'Eagle', shark: 'Shark', spider: 'Spider', alien: 'Alien', robot: 'Robot', joystick: 'Joystick',
  ghost: 'Ghost', pixelHeart: '8-bit heart',
};

/** Clã que nunca escolheu (RN-EMB-01). */
export const DEFAULT_EMBLEM: Readonly<ClanEmblem> = { frame: 'shield', symbol: 'tag', fillet: false, inverted: false };
/** Cores de clã sem cores escolhidas: prata no fundo, preto no símbolo. */
export const NEUTRAL_EMBLEM_COLOURS = ['#8E98A6', '#303030'] as const;

/** Emblema válido a partir de um valor qualquer (JSON da API ou do banco), ou null. */
export function parseEmblem(v: unknown): ClanEmblem | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!EMBLEM_FRAMES.includes(o.frame as EmblemFrame) || !EMBLEM_SYMBOLS.includes(o.symbol as EmblemSymbol)) return null;
  if (typeof o.fillet !== 'boolean' || typeof o.inverted !== 'boolean') return null;
  return { frame: o.frame as EmblemFrame, symbol: o.symbol as EmblemSymbol, fillet: o.fillet, inverted: o.inverted };
}

/** Cores como aparecem: [fundo, símbolo], depois de inverter. */
function shownColours(e: ClanEmblem, primary: string | null, secondary: string | null): [string, string] {
  const [p, s] = primary && secondary ? [primary, secondary] : NEUTRAL_EMBLEM_COLOURS;
  return e.inverted ? [s, p] : [p, s];
}

/**
 * Chave de unicidade (RN-EMB-02): moldura, símbolo, filete e as cores como aparecem. Com a tag como
 * símbolo, a própria tag entra na chave (tags diferentes já são emblemas diferentes).
 */
export function emblemKey(e: ClanEmblem, tag: string, primary: string | null, secondary: string | null): string {
  const [bg, fg] = shownColours(e, primary, secondary);
  const sym = e.symbol === 'tag' ? `tag:${tag.toUpperCase()}` : e.symbol;
  return [e.frame, sym, e.fillet ? 1 : 0, bg.toUpperCase(), fg.toUpperCase()].join('|');
}

const DARK = '#101410';
const LIGHT = '#E6E6E6';
const luminance = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A tag como símbolo: 1 a 3 caracteres, letra menor quanto mais caracteres. */
function tagDraw(tag: string): (f: string, h: string, stroke?: string) => string {
  const t = [...tag.toUpperCase()].slice(0, 3).join('');
  const size = [60, 60, 46, 34][[...t].length]; // índice = quantidade de caracteres
  return (f, _h, stroke) => {
    const st = stroke ? ` stroke="${stroke}" stroke-width="9" stroke-linejoin="round"` : '';
    return `<text x="50" y="53" text-anchor="middle" dominant-baseline="central" font-family="Inter, sans-serif" font-weight="700" font-size="${size}" letter-spacing="1" fill="${f}"${st}>${escapeXml(t)}</text>`;
  };
}

/**
 * O emblema em SVG (quadro de 100 × 100): fundo na cor primária com facetas de luz e sombra,
 * filete opcional, símbolo na secundária com sombra curta, contorno escuro (claro sobre fundo escuro).
 * Sem moldura, o símbolo ganha uma silhueta de contorno. Cores nulas viram as neutras.
 */
export function emblemSvg(e: ClanEmblem, tag: string, primary: string | null, secondary: string | null): string {
  const [bg, fg] = shownColours(e, primary, secondary);
  const draw = e.symbol === 'tag' ? tagDraw(tag) : SYMBOLS[e.symbol];
  const fr = FRAMES[e.frame];
  const head = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">';
  if (!fr) {
    const out = luminance(fg) < 0.22 ? LIGHT : DARK;
    const silhouette =
      e.symbol === 'tag'
        ? tagDraw(tag)(out, out, out)
        : `<g stroke="${out}" stroke-width="9" stroke-linejoin="round">${draw(out, out).replaceAll(/ stroke="[^"]*"| stroke-width="[^"]*"/g, '')}</g>`;
    return `${head}<g transform="translate(50 50) scale(1.08) translate(-50 -50)">${silhouette}${draw(fg, out)}</g></svg>`;
  }
  // O id do recorte sai da chave: o mesmo emblema repetido na página reaproveita um recorte igual.
  const id = `emb-${emblemKey(e, tag, primary, secondary).replace(/[^A-Za-z0-9]/g, '')}`;
  const out = luminance(bg) < 0.2 ? LIGHT : DARK;
  const fillet = e.fillet
    ? `<path d="${fr.d}" fill="none" stroke="${fg}" stroke-width="3.90" transform="translate(50 ${fr.cy}) scale(.82) translate(-50 -${fr.cy})"/>`
    : '';
  return (
    `${head}<defs><clipPath id="${id}"><path d="${fr.d}"/></clipPath></defs>` +
    `<path d="${fr.d}" fill="${bg}"/>` +
    `<g clip-path="url(#${id})"><path d="M0 0 H100 V34 L0 56 Z" fill="#fff" opacity=".13"/><path d="M0 100 H100 V74 L0 92 Z" fill="#000" opacity=".14"/></g>` +
    fillet +
    `<g transform="translate(50 ${50 + fr.dy}) scale(${fr.k}) translate(-50 -50)"><g transform="translate(2 2.5)" opacity=".35">${draw(DARK, DARK)}</g>${draw(fg, bg)}</g>` +
    (fr.metal
      ? `<path d="${fr.d}" fill="none" stroke="${DARK}" stroke-width="9" stroke-linejoin="round"/><path d="${fr.d}" fill="none" stroke="${fr.metal}" stroke-width="5" stroke-linejoin="round"/><path d="${fr.d}" fill="none" stroke="${fr.metal}" stroke-width="2.4" transform="translate(50 ${fr.cy}) scale(.86) translate(-50 -${fr.cy})"/></svg>`
      : `<path d="${fr.d}" fill="none" stroke="${out}" stroke-width="5" stroke-linejoin="round"/></svg>`)
  );
}
