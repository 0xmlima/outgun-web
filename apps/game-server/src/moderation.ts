// SPDX-License-Identifier: GPL-2.0-or-later
// Comandos do chat (OG-046, RN-CHT-03/04): port de `Server::chat` (src/server.cpp:1188-1477). Os
// textos são os do original (em inglês: o console do servidor não é traduzido). Diferenças da web
// em plan/specs/chat-moderacao.md.
import { checkName } from '@outgun/protocol';
import { executeSetLine, listSettings, type GameSettings, type SettingDef } from '@outgun/settings';

export type TextKind = 'normal' | 'team' | 'info' | 'header' | 'warning' | 'server' | 'admin';

export interface ConsolePlayer {
  pid: number;
  /** Id mostrado no /list e usado nos comandos (`uniqueId`). */
  uid: number;
  name: string;
  team: number;
  account: string | null;
  admin: boolean;
  /** Dono da sala privada (OG-049, RN-CFG-03): pode usar /set se o preset não for travado. */
  owner?: boolean;
  /** 0 = livre, 1 = silenciado, 2 = silenciado sem saber (smute). */
  muted: 0 | 1 | 2;
  bot: boolean;
  ranked: boolean;
  /** Para o ban por IP (não aparece no /list). */
  ip?: string;
  /** Hash do dispositivo, para o ban por dispositivo (OG-104). */
  device?: string;
}

/** Denúncia feita pelo `/report` (OG-104): vai para a fila da moderação (POST /internal/reports). */
export interface PlayerReport {
  roomId: string;
  map: string;
  reporter: ConsolePlayer;
  target: ConsolePlayer;
  reason: string;
}

/**
 * Limite das denúncias: 3 a cada 10 minutos por jogador e uma por alvo nesse tempo (o `/report`
 * não pode virar spam na fila da moderação). Tempo em frames da sala (10/s).
 */
export class ReportLimiter {
  private readonly sent = new Map<number, { frame: number; target: string }[]>();

  allow(reporter: ConsolePlayer, target: ConsolePlayer, frame: number): boolean {
    const window = 10 * 60 * 10;
    const key = target.account ?? `name:${target.name}`;
    const recent = (this.sent.get(reporter.uid) ?? []).filter((r) => frame - r.frame < window);
    if (recent.length >= 3 || recent.some((r) => r.target === key)) {
      this.sent.set(reporter.uid, recent);
      return false;
    }
    recent.push({ frame, target: key });
    this.sent.set(reporter.uid, recent);
    return true;
  }
}

/** Ação de admin para a auditoria (POST /internal/admin-actions). */
export interface AuditEntry {
  action: 'kick' | 'ban' | 'mute' | 'smute' | 'unmute' | 'forcemap' | 'set' | 'sayadmin';
  actor: ConsolePlayer;
  target?: ConsolePlayer;
  reason: string;
  durationSeconds?: number;
  details?: Record<string, string | number>;
}

/** O que o console precisa da sala. */
export interface ConsoleHost {
  readonly settings: GameSettings;
  /** Preset travado (Ranked, RN-MOD-04): sem /set. */
  readonly locked: boolean;
  players(): ConsolePlayer[];
  reply(pid: number, kind: TextKind, text: string): void;
  broadcastText(kind: TextKind, text: string): void;
  setMuted(target: number, mode: 0 | 1 | 2, admin: ConsolePlayer, tellTarget: boolean): void;
  /** Expulsa em 10 s; `minutes` > 0 = ban da sala. */
  kick(target: number, admin: ConsolePlayer, minutes: number, reason: string): boolean;
  /** Troca para o mapa que o admin votou, ou reinicia o atual. Devolve se foi troca de mapa. */
  forceMap(admin: ConsolePlayer): boolean;
  timeStatus(): string[];
  settingsChanged(line: string): void;
  resetSettings(): void;
  audit(entry: AuditEntry): void;
  /** `/report`: false se passou do limite de denúncias. */
  report(reporter: ConsolePlayer, target: ConsolePlayer, reason: string): boolean;
  /** `/bot` (OG-054); ausente = sala sem bots (Ranked, D-11). */
  bots?: BotConsole;
}

/** O que o `/bot` precisa da sala. */
export interface BotConsole {
  readonly maxPlayers: number;
  /** `extra_bots`: saldo do /bot add e /bot remove. */
  extra(): number;
  setExtra(n: number): void;
  playerCount(): number;
  /** Mudou algo: a sala recalcula os bots no próximo frame (`check_bots`). */
  changed(): void;
  rename(pid: number, name: string): void;
}

/** Admin da plataforma pode mudar as regras de jogo, mas não as do servidor (nome, rotação etc.). */
export function settingAllowed(def: SettingDef): boolean {
  return def.web !== 'ignored' && ['game', 'health', 'powerups', 'physics'].includes(def.category);
}

const MAX_BAN_MINUTES = 60 * 24 * 7;

/** `/list`: "%4d %4s%c %-22s", duas colunas por linha, com cabeçalho de time. */
export function listLines(players: readonly ConsolePlayer[]): { kind: TextKind; text: string }[] {
  const out: { kind: TextKind; text: string }[] = [{ kind: 'header', text: 'Remote players on server: ID, login flags, name' }];
  const humans = players.filter((p) => !p.bot).sort((a, b) => a.pid - b.pid);
  for (const team of [0, 1]) {
    const rows = humans.filter((p) => p.team === team);
    if (rows.length === 0) continue;
    out.push({ kind: 'header', text: team === 0 ? 'Red team:' : 'Blue team:' });
    for (let i = 0; i < rows.length; i += 2) {
      const cell = (p: ConsolePlayer) => {
        // strFlags: M (conta), R (ranking), S (auth.txt, não existe na web), A (admin)
        const flags = `${p.account ? 'M' : ' '}${p.ranked ? 'R' : ' '} ${p.admin ? 'A' : ' '}`;
        const mute = p.muted === 0 ? ' ' : p.muted === 1 ? 'm' : 's';
        return `${String(p.uid).padStart(4)} ${flags}${mute} ${p.name.padEnd(22)}`.slice(0, 33);
      };
      out.push({ kind: 'server', text: rows.slice(i, i + 2).map(cell).join('').trimEnd() });
    }
  }
  return out;
}

export function runCommand(host: ConsoleHost, pid: number, message: string): void {
  const me = host.players().find((p) => p.pid === pid);
  if (!me) return;
  const s = host.settings.server;
  const space = message.indexOf(' ', 1);
  const command = message.slice(1, space === -1 ? undefined : space);
  const args = space === -1 ? '' : message.slice(space + 1);
  const say = (kind: TextKind, text: string) => host.reply(pid, kind, text);
  const admin = me.admin;
  const canSet = (admin || me.owner === true) && !host.locked;

  if (command === 'help') {
    say('header', 'Console commands available on this server:');
    say('server', '/help       this screen');
    if (s.infoMessage.length) say('server', '/info       information about this server');
    say('server', '/time       check server uptime, current map time and time left on the map');
    say('server', '/report p r report player p to the moderators (reason r)');
    if (s.sayadminEnabled) say('server', `/sayadmin   send a message to the server admin${s.sayadminComment ? ` (${s.sayadminComment})` : ''}`);
    if (admin) {
      say('header', 'Admin commands:');
      say('server', '/list       get a list of player IDs');
      say('server', '/kick n r   kick player with ID n (reason r optional)');
      say('server', '/ban n t r  ban player with ID n for t minutes (default: 60; reason r optional)');
      say('server', '/mute n     mute player with ID n');
      say('server', '/smute n    silently mute player with ID n (crude!)');
      say('server', '/unmute n   cancel muting of player with ID n');
      say('server', "/forcemap   restart the game and change map if you've voted for one");
      if (!host.locked) say('server', '/set        manage server settings');
      if (host.bots) say('server', '/bot        manage bots');
    } else if (canSet) {
      say('header', 'Room owner commands:');
      say('server', '/set        manage room settings');
      if (host.bots) say('server', '/bot        manage bots');
    }
  } else if (command === 'info' && s.infoMessage.length) {
    s.infoMessage.forEach((line, i) => say(i === 0 ? 'header' : 'server', line));
  } else if (command === 'sayadmin' && s.sayadminEnabled) {
    if (args.trim()) {
      host.audit({ action: 'sayadmin', actor: me, reason: args.slice(0, 200) });
      say('server', 'Your message has been logged. Thank you for your feedback!');
    } else say('server', 'For example to send "Hello!", type /sayadmin Hello!');
  } else if (command === 'report') {
    reportCommand(host, me, args, say);
  } else if (command === 'time') {
    for (const line of host.timeStatus()) say('server', line);
  } else if (command === 'list' && admin) {
    for (const line of listLines(host.players())) say(line.kind, line.text);
  } else if (admin && ['kick', 'ban', 'mute', 'smute', 'unmute'].includes(command)) {
    moderate(host, me, command as 'kick', args, say);
  } else if (command === 'forcemap' && admin) {
    const change = host.forceMap(me);
    host.broadcastText('server', `${me.name} decided it's time for a ${change ? 'map change' : 'restart'}.`);
    host.audit({ action: 'forcemap', actor: me, reason: change ? 'forced a map change' : 'forced a restart' });
  } else if (command === 'set' && canSet) {
    if (args === 'reset') {
      host.resetSettings();
      host.audit({ action: 'set', actor: me, reason: 'reset', details: { line: 'reset' } });
      say('server', 'Server settings reset.');
    } else if (args.trim()) {
      let feedback: string[];
      if (args === 'list') {
        feedback = listSettings(settingAllowed);
        if (feedback.length === 0) feedback = ["You don't have access to any settings."];
      } else {
        const r = executeSetLine(host.settings, args, settingAllowed);
        feedback = r.feedback;
        if (r.changed) {
          host.settingsChanged(args);
          host.audit({ action: 'set', actor: me, reason: args.slice(0, 200), details: { line: args.slice(0, 200) } });
        }
      }
      for (const line of feedback) say('server', line);
    } else {
      say('server', 'Setting management commands:');
      say('server', '/set list   list all settings that you can manipulate');
      say('server', '/set s      show the current value of setting s');
      say('server', '/set s v    change the value of setting s to v');
      say('server', '/set reset  reload all settings from gamemod');
    }
  } else if (command === 'bot' && (admin || canSet) && host.bots) {
    botCommand(host, host.bots, args, say);
  } else if (command === 'bot' && admin) {
    say('warning', 'Bots are not allowed in Ranked rooms.');
  } else say('warning', `Unknown command ${command}. Type /help for a list.`);
}

/**
 * `/report nome motivo` (OG-104, novo na web): o nome é o do jogador como aparece (pode ter
 * espaços; vale o mais longo que bate com o começo do texto, sem diferenciar maiúsculas).
 */
function reportCommand(host: ConsoleHost, me: ConsolePlayer, args: string, say: (k: TextKind, t: string) => void): void {
  const text = args.trim();
  const lower = text.toLowerCase();
  const target = host
    .players()
    .filter((p) => !p.bot && p.pid !== me.pid && lower.startsWith(p.name.toLowerCase()) && (lower.length === p.name.length || lower[p.name.length] === ' '))
    .sort((a, b) => b.name.length - a.name.length)[0];
  const reason = target ? text.slice(target.name.length).trim().slice(0, 200) : '';
  if (!target || !reason) {
    say('server', 'For example to report Bob for cheating, type /report Bob aimbot');
    return;
  }
  if (!host.report(me, target, reason)) {
    say('warning', 'You have reported too many players recently. Try again later.');
    return;
  }
  say('server', `${target.name} has been reported to the moderators. Thank you!`);
}

/** Número inteiro no começo do texto, como `istream >> int`; null = não começa com número. */
function leadingInt(text: string | undefined): number | null {
  const m = text === undefined ? null : /^[+-]?\d+/.exec(text);
  return m ? Number(m[0]) : null;
}

/** `/bot` (src/server.cpp:1328-1456); o dono da sala Casual também pode usar (como o /set). */
function botCommand(host: ConsoleHost, bots: BotConsole, args: string, say: (k: TextKind, t: string) => void): void {
  const s = host.settings.server;
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const option = tokens[0];
  const botPlayers = host.players().filter((p) => p.bot);
  const max = bots.maxPlayers;
  if (option === undefined) {
    say('header', 'Bot commands:');
    say('server', '/bot list        list the bots with their ID');
    say('server', '/bot add n       add n bots, default 1');
    say('server', '/bot remove n    remove n bots, default 1');
    say('server', '/bot fill n      set bots_fill to n');
    say('server', '/bot balance s   set balance_bot on or off');
    say('server', '/bot ping p      show or set the bot ping');
    say('server', '/bot level l     show or set the bot level (1-5, or 0 for variable)');
    say('server', '/bot rename n s  set the name of bot with ID n to s');
    say('server', `Currently there are ${botPlayers.length} bots.`);
    say('server', `min_bots ${s.minBots}, bots_fill ${s.botsFill}, extra_bots ${bots.extra()}, balance_bot ${s.balanceBot ? 'on' : 'off'}`);
  } else if (option === 'list') {
    // "%4d %-17s", três por linha, cabeçalho por time
    for (const team of [0, 1]) {
      const rows = botPlayers.filter((p) => p.team === team).sort((a, b) => a.pid - b.pid);
      if (rows.length === 0) continue;
      say('header', team === 0 ? 'Red team:' : 'Blue team:');
      for (let i = 0; i < rows.length; i += 3) say('server', rows.slice(i, i + 3).map((p) => `${String(p.uid).padStart(4)} ${p.name.padEnd(17)}`).join('').trimEnd());
    }
  } else if (option === 'add' || option === 'remove') {
    const add = option === 'add';
    let number = tokens[1] === undefined ? 1 : leadingInt(tokens[1]);
    if (number === null || number < 1 || number > max) say('warning', `Syntax error. Valid range is 1 - ${max}`);
    else if (!add && botPlayers.length === 0) say('warning', 'No bots to remove.');
    else if (add && bots.playerCount() === max) say('warning', 'No room for a new bot.');
    else {
      if (add) {
        if (bots.extra() + number >= max) number = max - bots.extra();
        bots.setExtra(bots.extra() + number);
      } else {
        if (botPlayers.length - number < 0) number = botPlayers.length;
        bots.setExtra(bots.extra() - number);
      }
      say('server', `${number} bots will be ${add ? 'added' : 'removed'}.`);
      bots.changed();
    }
  } else if (option === 'fill') {
    const number = leadingInt(tokens[1]);
    if (tokens[1] === undefined) say('server', `Current bot fill is ${s.botsFill}.`);
    else if (number !== null && String(number) === tokens[1] && tokens.length === 2 && number >= 0 && number <= max) {
      s.botsFill = number;
      say('server', `Bot fill is now ${s.botsFill}.`);
      bots.changed();
    } else say('warning', `Syntax error. Valid range is 0 - ${max}.`);
  } else if (option === 'balance') {
    if (tokens[1] === undefined) say('server', `Balance bot is ${s.balanceBot ? 'on' : 'off'}.`);
    else if (tokens.length === 2 && (tokens[1] === 'on' || tokens[1] === 'off')) {
      s.balanceBot = tokens[1] === 'on';
      say('server', `Balance bot is now ${s.balanceBot ? 'on' : 'off'}.`);
      bots.changed();
    } else say('warning', "Syntax error. Valid settings are 'on' and 'off'.");
  } else if (option === 'level') {
    // OG-289: nível dos bots que entram (0 = cada um sorteia o seu); sem equivalente no original
    const level = leadingInt(tokens[1]);
    if (tokens[1] === undefined) say('server', `Current bot level is ${s.botLevel === 0 ? 'variable' : s.botLevel}.`);
    else if (level !== null && String(level) === tokens[1] && tokens.length === 2 && level >= 0 && level <= 5) {
      s.botLevel = level;
      say('server', `Bot level is now ${level === 0 ? 'variable' : level}. New bots will use it.`);
    } else say('warning', 'Syntax error. Valid level range is 0 - 5 (0 = variable).');
  } else if (option === 'ping') {
    const ping = leadingInt(tokens[1]);
    if (tokens[1] === undefined) say('server', `Current bot ping is ${s.botPing}.`);
    else if (ping !== null && String(ping) === tokens[1] && tokens.length === 2 && ping >= 0 && ping <= 2000) {
      s.botPing = ping;
      say('server', `Bot ping is now ${s.botPing}.`);
    } else say('warning', 'Syntax error. Valid ping range is 0 - 2000.');
  } else if (option === 'rename') {
    const uid = leadingInt(tokens[1]);
    const name = args.trim().replace(/^rename\s+\S+/, '').trim(); // `getline`: mantém os espaços do meio
    if (uid === null || String(uid) !== tokens[1] || tokens.length < 3) say('warning', 'Syntax error. Expecting "/rename ID name".');
    else if (!checkName(name)) say('warning', `Invalid name, "${name}".`);
    else {
      const target = host.players().find((p) => p.uid === uid);
      if (!target) say('warning', 'No such bot. Type /bot list for a list of IDs.');
      else if (!target.bot) say('warning', `Player ${uid} is not a bot.`);
      else bots.rename(target.pid, name);
    }
  } else say('warning', 'Syntax error. Expecting add, remove, fill, balance, ping, or level.');
}

/** /kick, /ban, /mute, /smute, /unmute ("ID [minutos] [motivo]"). */
function moderate(host: ConsoleHost, me: ConsolePlayer, command: 'kick' | 'ban' | 'mute' | 'smute' | 'unmute', args: string, say: (k: TextKind, t: string) => void): void {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const uidText = tokens.shift();
  let minutes = 60; // padrão do /ban
  if (command === 'ban' && tokens[0] !== undefined && /^-?\d+$/.test(tokens[0])) minutes = Number(tokens.shift());
  const reason = tokens.join(' ').slice(0, 200);
  const takesReason = command === 'kick' || command === 'ban';
  if (uidText === undefined || !/^\d+$/.test(uidText) || (!takesReason && tokens.length > 0)) {
    say('warning', `Syntax error. Expecting "/${command} ID${command === 'ban' ? ' [minutes]' : ''}".`);
    return;
  }
  const target = host.players().find((p) => p.uid === Number(uidText) && !p.bot);
  if (!target) {
    say('warning', 'No such player. Type /list for a list of IDs.');
    return;
  }
  if (command === 'kick') {
    if (host.kick(target.pid, me, 0, reason)) host.audit({ action: 'kick', actor: me, target, reason });
  } else if (command === 'ban') {
    if (target.pid === me.pid) say('warning', "You can't ban yourself.");
    else if (minutes <= 0 || minutes > MAX_BAN_MINUTES) say('warning', 'The ban time must be more than 0 and at most 10 000 minutes (1 week).');
    else if (host.kick(target.pid, me, minutes, reason)) host.audit({ action: 'ban', actor: me, target, reason, durationSeconds: minutes * 60 });
  } else {
    // `mutePlayer`: nada a fazer se já está nesse estado, ou se já está silenciado e pedem smute
    const mode = command === 'mute' ? 1 : command === 'smute' ? 2 : 0;
    if (target.muted === mode || (target.muted === 1 && mode === 2)) return;
    const tellTarget = mode !== 2 && (target.muted !== 2 || mode === 1);
    host.setMuted(target.pid, mode, me, tellTarget);
    host.audit({ action: command, actor: me, target, reason: '' });
  }
}
