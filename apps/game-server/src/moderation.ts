// SPDX-License-Identifier: GPL-2.0-or-later
// Comandos do chat (OG-046, RN-CHT-03/04): port de `Server::chat` (src/server.cpp:1188-1477). Os
// textos são os do original (em inglês: o console do servidor não é traduzido). Diferenças da web
// em plan/specs/chat-moderacao.md.
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
  /** 0 = livre, 1 = silenciado, 2 = silenciado sem saber (smute). */
  muted: 0 | 1 | 2;
  bot: boolean;
  ranked: boolean;
  /** Para o ban por IP (não aparece no /list). */
  ip?: string;
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

  if (command === 'help') {
    say('header', 'Console commands available on this server:');
    say('server', '/help       this screen');
    if (s.infoMessage.length) say('server', '/info       information about this server');
    say('server', '/time       check server uptime, current map time and time left on the map');
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
    }
  } else if (command === 'info' && s.infoMessage.length) {
    s.infoMessage.forEach((line, i) => say(i === 0 ? 'header' : 'server', line));
  } else if (command === 'sayadmin' && s.sayadminEnabled) {
    if (args.trim()) {
      host.audit({ action: 'sayadmin', actor: me, reason: args.slice(0, 200) });
      say('server', 'Your message has been logged. Thank you for your feedback!');
    } else say('server', 'For example to send "Hello!", type /sayadmin Hello!');
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
  } else if (command === 'set' && admin && !host.locked) {
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
  } else say('warning', `Unknown command ${command}. Type /help for a list.`);
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
