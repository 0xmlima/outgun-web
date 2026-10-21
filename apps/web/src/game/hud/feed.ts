// SPDX-License-Identifier: GPL-2.0-or-later
// Mensagens do jogo (mortes, bandeiras, avisos, chat) como o cliente original as escreve
// (`GuiClient::netKill`, `netFlagTake`... src/guiclient.cpp:1664-1975, src/clientbase.cpp) e o texto
// formatado com `$R`, `$G`, `$B`, `$>` (`FormattedText`, src/utility.cpp:642).
import type { AnyMessage } from '@outgun/protocol';

export type MessageType = 'normal' | 'team' | 'info' | 'header' | 'server' | 'warning' | 'admin';
export type SnippetColor = 'default' | 'red' | 'green' | 'blue';

export interface Snippet {
  readonly text: string;
  readonly color: SnippetColor;
}

export interface FeedLine {
  readonly type: MessageType;
  /** Time de quem mandou (chat), −1 se não se aplica. */
  readonly team: number;
  readonly parts: readonly Snippet[];
  /** Tempo do jogo (s) em que chegou; −1 = antes do primeiro frame (marcado depois por `stamp`). */
  time: number;
}

/** `FormattedText::escape`: `$` literal vira `$$`. */
export const escapeFormatted = (text: string) => text.replace(/\$/g, '$$$$');

/** `FormattedText::parse`. */
export function parseFormatted(code: string): Snippet[] {
  const out: Snippet[] = [];
  const stack: SnippetColor[] = ['default'];
  let text = '';
  let color: SnippetColor = 'default';
  const flush = () => {
    if (text) out.push({ text, color });
    text = '';
  };
  for (let i = 0; i < code.length; i++) {
    const ch = code[i] as string;
    const top = stack[stack.length - 1] as SnippetColor;
    if (ch !== '$' || code[i + 1] === '$') {
      if (ch === '$') i++;
      if (color !== top) {
        flush();
        color = top;
      }
      text += ch;
      continue;
    }
    const op = code[++i];
    if (op === '>') {
      if (stack.length > 1) stack.pop();
    } else if (op === 'R') stack.push('red');
    else if (op === 'G') stack.push('green');
    else if (op === 'B') stack.push('blue');
  }
  flush();
  return out;
}

/** `split_to_lines(msg, 79, 4)`: quebra em linhas de até `width` caracteres, continuação recuada. */
export function splitToLines(parts: readonly Snippet[], width = 79, indent = 4): Snippet[][] {
  const lines: Snippet[][] = [];
  let line: Snippet[] = [];
  let used = 0;
  let limit = width;
  const words: Snippet[] = [];
  for (const p of parts) for (const w of p.text.split(/(?<= )/)) if (w) words.push({ text: w, color: p.color });
  for (const word of words) {
    let rest = word.text;
    while (used + rest.length > limit) {
      const room = limit - used;
      // palavra inteira na próxima linha se couber nela; senão corta
      if (used > 0 && rest.length <= width - indent) break;
      line.push({ text: rest.slice(0, room), color: word.color });
      rest = rest.slice(room);
      lines.push(line);
      line = [{ text: ' '.repeat(indent), color: 'default' }];
      used = indent;
      limit = width;
    }
    if (used + rest.length > limit) {
      lines.push(line);
      line = [{ text: ' '.repeat(indent), color: 'default' }];
      used = indent;
    }
    if (rest) {
      line.push({ text: rest, color: word.color });
      used += rest.length;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

export type Translate = (text: string, ...args: string[]) => string;

/** O que o feed descobriu ao tratar uma mensagem (usado pelos sons). */
export interface FeedFacts {
  readonly joined?: boolean;
  readonly spreeStarted?: number;
  /** O servidor avisou que o voto para sair não vale sem voto num mapa (`want_map_exit_delayed`). */
  readonly voteNoEffect?: boolean;
}

/** Aviso do servidor quando `require_specific_map_vote` está ligado. */
export const NO_EFFECT = 'Your vote has no effect until you vote for a specific map.';

/**
 * Tradução de texto com cores: o catálogo do 1.0.3 só tem a versão sem `$R`/`$G`/`$B`/`$>` (o
 * original mostrava essas mensagens em inglês); sem a versão com cor, usa a tradução sem cor.
 */
export function translateFormatted(t: Translate): Translate {
  // `$1`..`$5` repostos: só a busca no catálogo, sem as substituições
  const translated = (k: string) => t(k, '$1', '$2', '$3', '$4', '$5') !== k;
  return (key, ...args) => {
    if (translated(key) || !/\$[RGB>]/.test(key)) return t(key, ...args);
    const plain = key.replace(/\$[RGB>]/g, '');
    return translated(plain) ? t(plain, ...args) : t(key, ...args);
  };
}

export interface FeedContext {
  readonly me: number;
  readonly teamOf: (pid: number) => number;
  readonly name: (pid: number) => string;
  readonly frags: (pid: number) => number;
  /** Tempo do jogo (s). */
  readonly time: number;
  readonly captureLimit: number;
  /** Minutos (0 = sem limite). */
  readonly timeLimit: number;
  /** Minutos de prorrogação no empate (0 = sem). */
  readonly extraTime?: number;
  /** Mapas na rotação (0 = lista ainda não chegou). */
  readonly mapCount: number;
}

/** Mensagens recentes (`chatbuffer`) e as regras do original para gerá-las a partir dos eventos. */
export class MessageFeed {
  readonly lines: FeedLine[] = [];
  /** Mortes seguidas de cada jogador (`current_cons_kills`), para as sequências de 10. */
  private readonly spree = new Map<number, number>();
  /** Quem já estava na sala ao entrar não é anunciado (o original usa o nome " "). */
  private readonly present = new Set<number>();

  private readonly t: Translate;
  /** `Show killing messages` e `Show flag messages` (OG-068; capturas aparecem sempre). */
  showKillMessages = true;
  showFlagMessages = true;

  constructor(
    translate: Translate,
    private readonly maxLines = 200,
  ) {
    this.t = translateFormatted(translate);
  }

  /** `print_message`. */
  push(type: MessageType, code: string, time: number, team = -1): void {
    for (const parts of splitToLines(parseFormatted(code))) this.lines.push({ type, team, parts, time });
    if (this.lines.length > this.maxLines) this.lines.splice(0, this.lines.length - this.maxLines);
  }

  /** Texto que a pessoa digitou ou que veio do servidor, sem códigos de cor. */
  pushPlain(type: MessageType, text: string, time: number, team = -1): void {
    this.push(type, escapeFormatted(text), time, team);
  }

  /**
   * Mensagens do servidor que viram texto na tela. Devolve o que o som também precisa saber: se a
   * entrada foi anunciada e quem começou uma sequência de 10 mortes.
   */
  onMessage(m: AnyMessage, c: FeedContext): FeedFacts {
    const facts: { joined?: boolean; spreeStarted?: number; voteNoEffect?: boolean } = {};
    const t = this.t;
    const name = (pid: number) => (c.teamOf(pid) === 0 ? '$R' : '$B') + escapeFormatted(c.name(pid)) + '$>';
    const flag = (pid: number, carried: string) => {
      const team = c.teamOf(pid);
      if (carried === 'wild') return 'wild';
      return (team === 0 && carried === 'own') || (team === 1 && carried === 'enemy') ? 'red' : 'blue';
    };
    const flagText = (prefix: string, which: string, pid: number) =>
      t(`$1 ${prefix} THE ${which === 'wild' ? '$GWILD' : which === 'red' ? '$RRED' : '$BBLUE'} FLAG$>!`, name(pid));
    const info = (code: string) => this.push('info', code, c.time);
    const killInfo = (code: string) => this.showKillMessages && info(code);
    const flagInfo = (code: string) => this.showFlagMessages && info(code);
    switch (m.type) {
      case 'playersPresent':
        for (const pid of m.pids) this.present.add(pid);
        break;
      case 'playerJoined':
        if (!this.present.has(m.pid)) {
          info(t('$1 entered the game.', (c.teamOf(m.pid) === 0 ? '$R' : '$B') + escapeFormatted(m.name) + '$>'));
          facts.joined = true;
        }
        this.present.add(m.pid);
        break;
      case 'playerLeft':
        info(t('$1 left the game with $2 frags.', name(m.pid), String(c.frags(m.pid))));
        this.spree.delete(m.pid);
        this.present.delete(m.pid);
        break;
      case 'kill': {
        const known = c.name(m.attacker) !== '';
        const same = c.teamOf(m.attacker) === c.teamOf(m.target);
        const verbs = {
          deathbringer: ['$1 was choked.', '$1 was choked by teammate $2.', '$1 was choked by $2.'],
          collision: ['$1 received a mortal blow.', '$1 received a mortal blow from teammate $2.', '$1 received a mortal blow from $2.'],
          rocket: ['$1 was nailed.', '$1 was nailed by teammate $2.', '$1 was nailed by $2.'],
        }[m.cause];
        killInfo(t(verbs[!known ? 0 : same ? 1 : 2] as string, name(m.target), name(m.attacker)));
        const ended = (this.spree.get(m.target) ?? 0) >= 10;
        this.spree.set(m.target, 0);
        if (ended) killInfo(known ? t("$1's killing spree was ended by $2.", name(m.target), name(m.attacker)) : t("$1's killing spree was ended.", name(m.target)));
        if (m.carriedFlag !== 'none') flagInfo(flagText('LOST', flag(m.target, m.carriedFlag), m.target));
        if (!same && known) {
          const n = (this.spree.get(m.attacker) ?? 0) + 1;
          this.spree.set(m.attacker, n);
          if (n % 10 === 0) {
            killInfo(t('$1 is on a killing spree!', name(m.attacker)));
            facts.spreeStarted = m.attacker;
          }
        }
        break;
      }
      case 'suicideEvent': {
        if ((this.spree.get(m.pid) ?? 0) >= 10) killInfo(t("$1's killing spree was ended.", name(m.pid)));
        this.spree.set(m.pid, 0);
        if (m.carriedFlag !== 'none') flagInfo(flagText('LOST', flag(m.pid, m.carriedFlag), m.pid));
        break;
      }
      case 'flagTake':
        flagInfo(flagText('GOT', flag(m.pid, m.flag), m.pid));
        break;
      case 'flagDrop':
        if (!m.captureDrop) flagInfo(flagText('DROPPED', flag(m.pid, m.flag), m.pid));
        break;
      case 'flagReturn':
        flagInfo(t(c.teamOf(m.pid) === 0 ? '$1 RETURNED THE $RRED FLAG$>!' : '$1 RETURNED THE $BBLUE FLAG$>!', name(m.pid)));
        break;
      case 'capture': {
        const which = m.flagTeam === 'wild' ? 'wild' : c.teamOf(m.pid) === 0 ? 'blue' : 'red';
        info(flagText('CAPTURED', which, m.pid));
        break;
      }
      case 'timeEvent': {
        const texts = {
          fiveMinutesLeft: '*** Five minutes remaining',
          oneMinuteLeft: '*** One minute remaining',
          thirtySecondsLeft: '*** 30 seconds remaining',
          timeOut: '*** Time out - CTF game over',
          extraTimeOut: '*** Extra-time out - CTF game over',
          normalTimeOut: '*** Normal time out - extra-time started',
          normalTimeOutSuddenDeath: '*** Normal time out - extra-time started',
        } as const;
        let text = escapeFormatted(t(texts[m.kind]));
        if (m.kind === 'normalTimeOutSuddenDeath') text += ' ' + escapeFormatted(t('(sudden death)'));
        info(text);
        break;
      }
      case 'gameOver':
        break; // o placar final vem de `gameOverScores` (precisa do placar do cliente)
      case 'mapChange':
        info(escapeFormatted(c.mapCount > 0 ? t('This map is $1 ($2 of $3).', m.title, String(m.mapIndex + 1), String(c.mapCount)) : t('This map is $1.', m.title)));
        break;
      case 'mapChangeInfo': {
        let text = t('*** $1/$2 votes for mapchange.', String(m.votes), String(m.needed));
        if (m.voteBlockSeconds > 0) text += ' ' + t('(All players needed for $1 more seconds.)', String(m.voteBlockSeconds));
        this.pushPlain('info', text, c.time);
        break;
      }
      case 'text': {
        const team = m.from === 255 ? -1 : c.teamOf(m.from);
        // textos fixos do servidor que o original traduz (`net_text_message`)
        const fixed = m.kind === 'server' && m.text === NO_EFFECT;
        if (fixed) facts.voteNoEffect = true;
        this.pushPlain(m.kind, fixed ? t(NO_EFFECT) : m.text, c.time, team);
        break;
      }
      case 'teamChange':
        if (m.swappedColor !== 255) info(t('$1 and $2 swapped teams.', name(m.from), name(m.to)));
        else info(t(c.teamOf(m.from) === 1 ? '$1 moved to red team.' : '$1 moved to blue team.', name(m.from)));
        break;
      case 'idleKickWarning':
        this.pushPlain('warning', t('*** Idle kick: move or be kicked in $1 seconds.', String(m.seconds)), c.time);
        break;
      case 'tooMuchTalk':
        this.pushPlain('warning', t('Too much talk. Chill...'), c.time);
        break;
      case 'muted':
        this.pushPlain('warning', t("You are muted. You can't send messages."), c.time);
        break;
      // moderação (OG-046; `data_player_mute` e `data_player_kick` em src/clientbase.cpp)
      case 'playerMute': {
        const admin = m.admin || t('The admin');
        if (m.pid === c.me) this.pushPlain('warning', m.mode === 0 ? t('You have been unmuted (you can send messages again).') : t("You have been muted by $1 (you can't send messages).", admin), c.time);
        else info(t(m.mode === 0 ? '$1 has unmuted $2.' : '$1 has muted $2.', escapeFormatted(admin), name(m.pid)));
        break;
      }
      case 'playerKick': {
        const admin = m.admin || t('The admin');
        if (m.pid === c.me) this.pushPlain('warning', m.minutes === 0 ? t('You are being kicked from this server by $1!', admin) : t('$1 has BANNED you from this server for $2!', admin, approxTime(m.minutes * 60, t)), c.time);
        else info(t(m.minutes === 0 ? '$1 has kicked $2 (disconnect in 10 seconds).' : '$1 has banned $2 (disconnect in 10 seconds).', escapeFormatted(admin), name(m.pid)));
        break;
      }
      case 'disconnecting':
        if (m.seconds > 0) this.pushPlain('warning', t('Disconnecting in $1...', String(m.seconds)), c.time);
        break;
      default:
        break;
    }
    return facts;
  }

  /** `netGameoverPeriodStart`: placar final e o objetivo da próxima partida. */
  gameOverScores(red: number, blue: number, c: FeedContext): void {
    const t = this.t;
    this.push('info', t('CTF GAME OVER - FINAL SCORE: $RRED $1$> - $BBLUE $2$>', String(red), String(blue)), c.time);
    const parts: string[] = [];
    if (c.captureLimit > 0) parts.push(t('CAPTURE $1 FLAGS TO WIN THE GAME.', String(c.captureLimit)));
    if (c.timeLimit > 0) parts.push(t('TIME LIMIT IS $1 MINUTES.', String(c.timeLimit)));
    if (c.timeLimit > 0 && (c.extraTime ?? 0) > 0) parts.push(t('IF TIED, $1 MINUTES OF EXTRA TIME.', String(c.extraTime)));
    if (parts.length) this.pushPlain('info', parts.join(' '), c.time);
  }

  /** Marca com `time` as mensagens que chegaram antes de o relógio do servidor ser conhecido. */
  stamp(time: number): void {
    for (const l of this.lines) if (l.time < 0) l.time = time;
  }

  /** Linhas visíveis (`draw_game_frame`): as últimas `count`, e só as dos últimos 80 s sem Insert. */
  visible(count: number, time: number, all: boolean, width = 79): FeedLine[] {
    let lines = this.lines.slice(Math.max(0, this.lines.length - count));
    if (!all) {
      const first = lines.findIndex((l) => time < l.time + 80);
      lines = first === -1 ? [] : lines.slice(first);
    }
    // chat mais estreito que 79 caracteres (coluna das telas largas, OG-295): quebra de novo
    if (width < 79) {
      lines = lines.flatMap((l) => splitToLines(l.parts, width).map((parts) => ({ ...l, parts })));
      lines = lines.slice(Math.max(0, lines.length - count));
    }
    return lines;
  }
}

/** Texto de entrada do chat (`print_chat_messages`): prefixo, texto mostrado e posição do cursor. */
export function chatPrompt(buffer: string, t: Translate): { text: string; cursor: number } {
  if (!buffer) return { text: '', cursor: -1 };
  const prefix = (buffer.startsWith('/') ? t('Command') : buffer.startsWith('.') ? t('Say team') : t('Say')) + ': ';
  const body = buffer.startsWith('.') ? buffer.slice(1) : buffer;
  return { text: prefix + body, cursor: (prefix + body).length };
}

/** `approxTime` (src/utility.cpp:514): duração arredondada na maior unidade que couber. */
export function approxTime(seconds: number, t: (text: string, ...args: string[]) => string): string {
  let time = seconds;
  let unit: string;
  const div = (a: number, b: number) => Math.trunc(a / b);
  if (time === 0 || (time % 60 !== 0 && time <= 200)) unit = time === 1 ? 'second' : 'seconds';
  else {
    time = div(time + 40, 60);
    if (time % 60 !== 0 && time <= 200) unit = time === 1 ? 'minute' : 'minutes';
    else {
      time = div(time + 40, 60);
      if (time % 24 !== 0 && time <= 100) unit = time === 1 ? 'hour' : 'hours';
      else {
        time = div(time + 16, 24);
        if (time % 365 === 0 || time >= 7 * 100) {
          time = div(time + 250, 365);
          unit = time === 1 ? 'year' : 'years';
        } else if (time % 7 !== 0 && time <= 50) unit = time === 1 ? 'day' : 'days';
        else {
          time = div(time + 5, 7);
          unit = time === 1 ? 'week' : 'weeks';
        }
      }
    }
  }
  return `${time} ${t(unit)}`;
}
