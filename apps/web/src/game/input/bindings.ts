// SPDX-License-Identifier: GPL-2.0-or-later
// Ações do jogo e as teclas associadas (plan/specs/entrada.md). Teclas pela posição física
// (`KeyboardEvent.code`); uma associação é um "acorde": modificadores opcionais + uma tecla.
import { CONTROL } from '@outgun/sim';

/** Ações seguradas: valem enquanto a tecla está pressionada. */
export const HELD_ACTIONS = ['up', 'down', 'left', 'right', 'fire', 'run', 'strafe', 'dropFlag', 'showPings'] as const;
/** Ações de toque: disparam ao pressionar. */
export const PRESS_ACTIONS = [
  'suicide',
  'changeTeam',
  'help',
  'mapList',
  'teamStats',
  'playerStats',
  'serverInfo',
  'voteMapChange',
  'moreMessages',
  'fullPlayfield',
  'toggleNames',
  'toggleSound',
  'screenshot',
  'focusMode',
  // Ranked (OG-264): pausa tática e o voto do bot substituto
  'pause',
  'voteBot',
  'voteShort',
] as const;

export type HeldAction = (typeof HELD_ACTIONS)[number];
export type PressAction = (typeof PRESS_ACTIONS)[number];
export type Action = HeldAction | PressAction;
export const ACTIONS: readonly Action[] = [...HELD_ACTIONS, ...PRESS_ACTIONS];

/** Rótulo de cada ação: textos do original quando existem (traduzidos em @outgun/i18n). */
export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  fire: 'Shoot',
  run: 'Run',
  strafe: 'Strafe',
  dropFlag: 'Drop flag',
  showPings: 'Show pings',
  suicide: 'Suicide',
  changeTeam: 'Change team',
  help: 'In-game help',
  mapList: 'Map list',
  teamStats: 'Team stats',
  playerStats: 'Player stats',
  serverInfo: 'Server info',
  voteMapChange: 'Vote map change',
  moreMessages: 'Show more messages',
  fullPlayfield: 'Show minimap and scoreboard',
  toggleNames: 'Toggle names',
  toggleSound: 'Toggle sound',
  screenshot: 'Screenshot',
  focusMode: 'Focus mode',
  pause: 'Pause (Ranked)',
  voteBot: 'Vote: bot in place',
  voteShort: 'Vote: play one short',
};

/** Acorde: tecla física e modificadores exigidos. */
export interface Chord {
  readonly code: string;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

export type Bindings = Readonly<Record<Action, readonly Chord[]>>;

const k = (...codes: string[]): Chord[] => codes.map((code) => ({ code }));
const ctrl = (code: string): Chord => ({ code, ctrl: true });

/** Teclas do original ("Key summary" de doc/game.html). */
export const CLASSIC_BINDINGS: Bindings = {
  up: k('ArrowUp', 'Numpad8', 'Numpad7', 'Numpad9'),
  down: k('ArrowDown', 'Numpad2', 'Numpad5', 'Numpad1', 'Numpad3'),
  left: k('ArrowLeft', 'Numpad4', 'Numpad7', 'Numpad1'),
  right: k('ArrowRight', 'Numpad6', 'Numpad9', 'Numpad3'),
  fire: k('ControlLeft', 'ControlRight'),
  run: k('ShiftLeft', 'ShiftRight'),
  strafe: k('AltLeft', 'AltRight'),
  dropFlag: k('PageDown'),
  showPings: k('Tab'),
  suicide: k('Delete'),
  changeTeam: [ctrl('End')],
  help: k('F1'),
  mapList: k('F2'),
  teamStats: k('F3'),
  playerStats: k('F4'),
  serverInfo: k('F5'),
  voteMapChange: k('F8'),
  moreMessages: k('Insert'),
  // como o original; fora do modo foco o navegador pode abrir as ferramentas de desenvolvimento
  fullPlayfield: k('F12'),
  // Ctrl+N abre janela no navegador fora do modo foco: F6 é a alternativa
  toggleNames: [ctrl('KeyN'), { code: 'F6' }],
  toggleSound: [ctrl('KeyM')],
  // F11 é a tela cheia do navegador
  screenshot: k('F9'),
  focusMode: k('F10'),
  // Ctrl+P: o P sozinho pausava em vez de começar uma mensagem com "p" (OG-336)
  pause: [ctrl('KeyP'), { code: 'Pause' }],
  // Ctrl+1/Ctrl+2: 1 e 2 sozinhos são códigos de estratégia no chat (OG-348, D-64)
  voteBot: [ctrl('Digit1')],
  voteShort: [ctrl('Digit2')],
};

/** Esquema sem Ctrl/Alt (nenhum atalho do navegador por perto). */
export const BROWSER_BINDINGS: Bindings = {
  ...CLASSIC_BINDINGS,
  fire: k('Space'),
  run: k('KeyZ'),
  strafe: k('KeyX'),
  changeTeam: k('End'),
  toggleNames: k('F6'),
  toggleSound: k('F7'),
  pause: k('Pause', 'Home'),
  // Ctrl+número troca de aba no navegador: o voto é pelo clique no aviso (D-64)
  voteBot: [],
  voteShort: [],
};

export const SCHEMES = { classic: CLASSIC_BINDINGS, browser: BROWSER_BINDINGS } as const;
export type Scheme = keyof typeof SCHEMES;

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight']);

export interface KeyEventLike {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** Acorde de um evento (para gravar uma nova associação). Teclas modificadoras valem sozinhas. */
export function chordOf(ev: KeyEventLike): Chord {
  if (MODIFIER_CODES.has(ev.code)) return { code: ev.code };
  const chord: { code: string; ctrl?: boolean; alt?: boolean; shift?: boolean } = { code: ev.code };
  if (ev.ctrlKey) chord.ctrl = true;
  if (ev.altKey) chord.alt = true;
  if (ev.shiftKey) chord.shift = true;
  return chord;
}

const hasModifiers = (c: Chord) => !!(c.ctrl || c.alt || c.shift);
const sameChord = (a: Chord, b: Chord) => a.code === b.code && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift;

/**
 * Ações de toque disparadas por um evento. Acordes com modificador casam exatamente; sem
 * modificador, casam com qualquer modificador, mas só se nenhum acorde com modificador casou
 * (Ctrl+End troca de time; Delete com o Ctrl do tiro segurado ainda é suicídio).
 */
export function pressedActions(bindings: Bindings, ev: KeyEventLike): PressAction[] {
  const exact = PRESS_ACTIONS.filter((a) => bindings[a].some((c) => hasModifiers(c) && c.code === ev.code && !!c.ctrl === ev.ctrlKey && !!c.alt === ev.altKey && !!c.shift === ev.shiftKey));
  if (exact.length) return exact;
  return PRESS_ACTIONS.filter((a) => bindings[a].some((c) => !hasModifiers(c) && c.code === ev.code));
}

/**
 * Tecla de alguma ação com os modificadores do evento: acorde com modificador casa exatamente, sem
 * modificador casa sempre. É o que impede o chat de começar (OG-336: só a tecla física barrava o "n"
 * do Ctrl+N).
 */
export function isGameKey(bindings: Bindings, ev: KeyEventLike): boolean {
  return ACTIONS.some((a) => bindings[a].some((c) => c.code === ev.code && (!hasModifiers(c) || (!!c.ctrl === ev.ctrlKey && !!c.alt === ev.altKey && !!c.shift === ev.shiftKey))));
}

/** Teclas físicas que o jogo usa (para `preventDefault`). */
export function boundCodes(bindings: Bindings): Set<string> {
  return new Set(ACTIONS.flatMap((a) => bindings[a].map((c) => c.code)));
}

/** Ações seguradas ativas com as teclas `pressed` pressionadas. */
export function heldActions(bindings: Bindings, pressed: ReadonlySet<string>): Set<HeldAction> {
  return new Set(HELD_ACTIONS.filter((a) => bindings[a].some((c) => pressed.has(c.code))));
}

/** Bits de `CONTROL` (`ClientControls::fromKeyboard`). */
export function controlBits(held: ReadonlySet<HeldAction>): number {
  let bits = 0;
  if (held.has('up')) bits |= CONTROL.up;
  if (held.has('down')) bits |= CONTROL.down;
  if (held.has('left')) bits |= CONTROL.left;
  if (held.has('right')) bits |= CONTROL.right;
  if (held.has('run')) bits |= CONTROL.run;
  if (held.has('strafe')) bits |= CONTROL.strafe;
  return bits;
}

/**
 * Associa `chord` à ação como primeira tecla. A mesma tecla sai das outras ações (sem duplicar),
 * exceto entre as direções, onde as diagonais do teclado numérico pertencem a duas ações.
 */
export function rebind(bindings: Bindings, action: Action, chord: Chord): Bindings {
  const directions: readonly Action[] = ['up', 'down', 'left', 'right'];
  const out = {} as Record<Action, readonly Chord[]>;
  for (const a of ACTIONS) {
    const keep = directions.includes(a) && directions.includes(action) && a !== action;
    out[a] = keep ? bindings[a] : bindings[a].filter((c) => !sameChord(c, chord));
  }
  out[action] = [chord, ...out[action]];
  return out;
}

export function serializeBindings(bindings: Bindings): string {
  return JSON.stringify(bindings);
}

/** Lê associações salvas; ações ausentes ou inválidas ficam com o padrão. */
export function parseBindings(text: string | null, fallback: Bindings = CLASSIC_BINDINGS): Bindings {
  const out = { ...fallback } as Record<Action, readonly Chord[]>;
  if (!text) return out;
  try {
    const saved = JSON.parse(text) as Record<string, unknown>;
    for (const a of ACTIONS) {
      const list = saved[a];
      if (Array.isArray(list) && list.every((c) => typeof c === 'object' && c && typeof (c as Chord).code === 'string')) out[a] = list as Chord[];
    }
    // P sozinho como pausa (padrão até a v2.34) sai: fica a pausa do esquema atual (OG-336)
    if (out.pause.some((c) => c.code === 'KeyP' && !hasModifiers(c))) {
      const kept = out.pause.filter((c) => c.code !== 'KeyP' || hasModifiers(c));
      out.pause = [...fallback.pause.filter((c) => !kept.some((k) => sameChord(k, c)) && !ACTIONS.some((a) => a !== 'pause' && out[a].some((o) => sameChord(o, c)))), ...kept];
    }
    // 1 e 2 sozinhos no voto (padrão até a v2.35) saem: fica o voto do esquema atual (OG-348)
    for (const a of ['voteBot', 'voteShort'] as const) {
      const digit = a === 'voteBot' ? 'Digit1' : 'Digit2';
      if (!out[a].some((c) => c.code === digit && !hasModifiers(c))) continue;
      const kept = out[a].filter((c) => c.code !== digit || hasModifiers(c));
      out[a] = [...fallback[a].filter((c) => !kept.some((k) => sameChord(k, c)) && !ACTIONS.some((o) => o !== a && out[o].some((x) => sameChord(x, c)))), ...kept];
    }
  } catch {
    // associações corrompidas: padrão
  }
  return out;
}

/** Nome legível de um acorde. */
export function chordLabel(chord: Chord, alt = 'Alt'): string {
  const names: Record<string, string> = {
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    AltLeft: alt,
    AltRight: alt === 'Alt' ? 'Alt Gr' : `Right ${alt}`,
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    PageDown: 'Page Down',
    PageUp: 'Page Up',
    Space: 'Space',
  };
  let key = names[chord.code] ?? chord.code;
  if (/^Key[A-Z]$/.test(chord.code)) key = chord.code.slice(3);
  else if (/^Digit\d$/.test(chord.code)) key = chord.code.slice(5);
  else if (/^Numpad/.test(chord.code)) key = `Pad ${chord.code.slice(6)}`;
  return [chord.ctrl && 'Ctrl', chord.alt && alt, chord.shift && 'Shift', key].filter(Boolean).join('+');
}
