// SPDX-License-Identifier: GPL-2.0-or-later
// Chat e moderação na sala (OG-046): comandos, anti-flood, mute/smute, kick/ban, /set e auditoria.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { wordSet } from './chat.js';
import { loadMaps } from './maps.js';
import { listLines, ReportLimiter, type AuditEntry, type ConsolePlayer, type PlayerReport } from './moderation.js';
import { Room, type Connection, type Identity } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1', '2 versus 2 (duel)']);

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  closed: [number, string] | null = null;
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(code: number, reason: string): void {
    this.closed = [code, reason];
  }
  of<T extends AnyMessage['type']>(type: T): Extract<AnyMessage, { type: T }>[] {
    return this.received.filter((m): m is Extract<AnyMessage, { type: T }> => m.type === type);
  }
  texts(): string[] {
    return this.of('text').map((m) => m.text);
  }
}

function setup(preset = 'classic', opts: { chatFilter?: ReadonlySet<string>; reportPlayer?: (r: PlayerReport) => void } = {}) {
  const audit: AuditEntry[] = [];
  const r = new Room({ id: 'r', preset, maps, mapFiles: ['outgun1', '2 versus 2 (duel)'], maxPlayers: 16, seed: 7, audit: (_room, e) => audit.push(e), ...opts });
  const join = (name: string, identity: Partial<Identity> = {}) => {
    const conn = new TestConnection();
    const res = r.join(conn, { name, accountId: null, ...identity });
    if (!res.ok) throw new Error(res.text);
    r.handle(res.pid, [message('clientReady', {})]);
    return { conn, pid: res.pid };
  };
  const say = (pid: number, text: string) => {
    r.handle(pid, [message('chat', { text, teamOnly: false })]);
    r.tick();
  };
  return { r, audit, join, say };
}

describe('chat (RN-CHT-01/02)', () => {
  it('anti-flood só na rajada extrema: a 31ª mensagem seguida é descartada com "too much talk" (D-60)', () => {
    const { r, join } = setup();
    const a = join('Ana');
    const b = join('Bia');
    r.handle(
      a.pid,
      Array.from({ length: 31 }, (_, i) => message('chat', { text: `msg ${i + 1}`, teamOnly: false })),
    );
    r.tick();
    expect(b.conn.texts()).toHaveLength(30);
    expect(a.conn.of('tooMuchTalk')).toHaveLength(1);
  });

  it('caractere repetido passa (kkkkkkkk); só espaços é ignorado', () => {
    const { join, say } = setup();
    const a = join('Ana');
    const b = join('Bia');
    say(a.pid, 'kkkkkkkk');
    say(a.pid, '   ');
    expect(b.conn.texts()).toEqual(['Ana: kkkkkkkk']);
  });

  it('filtro de palavras opcional por sala', () => {
    const { join, say } = setup('classic', { chatFilter: wordSet(['bobo']) });
    const a = join('Ana');
    const b = join('Bia');
    say(a.pid, 'que Bobo');
    expect(b.conn.texts()).toEqual(['Ana: que ****']);
  });
});

describe('comandos (RN-CHT-03)', () => {
  it('/help de jogador e de admin; comando de admin sem permissão é desconhecido', () => {
    const { join, say } = setup();
    const a = join('Ana');
    const adm = join('Chefe', { admin: true, accountId: 'u-1' });
    say(a.pid, '/help');
    expect(a.conn.texts()).toContain('/time       check server uptime, current map time and time left on the map');
    expect(a.conn.texts().some((t) => t.startsWith('/kick'))).toBe(false);
    say(a.pid, '/kick 1');
    expect(a.conn.texts().at(-1)).toBe('Unknown command kick. Type /help for a list.');
    say(adm.pid, '/help');
    expect(adm.conn.texts()).toContain('Admin commands:');
  });

  it('/time mostra tempo de servidor e de mapa', () => {
    const { join, say, r } = setup();
    const a = join('Ana');
    for (let i = 0; i < 100; i++) r.tick();
    say(a.pid, '/time');
    const [up, map] = a.conn.texts().slice(-2);
    expect(up).toMatch(/^The server has been up for 10 seconds\.$/);
    expect(map).toBe('Map time: 10 seconds. There is no time limit.');
  });

  it('/list mostra id, flags e nome por time', () => {
    const { join, say } = setup();
    const a = join('Ana', { accountId: 'u-2' });
    join('Bia');
    const adm = join('Chefe', { admin: true, accountId: 'u-1' });
    say(adm.pid, '/list');
    const texts = adm.conn.texts();
    expect(texts[0]).toBe('Remote players on server: ID, login flags, name');
    expect(texts).toContain('Red team:');
    expect(texts.some((t) => t.startsWith(`   1 M     Ana`))).toBe(true);
    expect(texts.some((t) => t.includes('   3 M  A  Chefe'))).toBe(true);
    void a;
  });

  it('listLines quebra em duas colunas de 33 caracteres', () => {
    const p = (uid: number, name: string) => ({ pid: uid, uid, name, team: 0, account: null, admin: false, muted: 0 as const, bot: false, ranked: false });
    const lines = listLines([p(1, 'A'), p(2, 'B'), p(3, 'C')]);
    expect(lines.map((l) => l.text)).toEqual(['Remote players on server: ID, login flags, name', 'Red team:', `   1       ${'A'.padEnd(22)}   2       B`, '   3       C']);
  });
});

describe('moderação (RN-CHT-03/04)', () => {
  it('mute: o alvo é avisado e não fala; unmute libera; tudo auditado', () => {
    const { join, say, audit } = setup();
    const a = join('Ana');
    const b = join('Bia');
    const adm = join('Chefe', { admin: true, accountId: 'u-1' });
    say(adm.pid, '/mute 1');
    expect(a.conn.of('playerMute')).toEqual([expect.objectContaining({ pid: a.pid, mode: 1, admin: 'Chefe' })]);
    say(a.pid, 'oi');
    expect(a.conn.of('muted')).toHaveLength(1);
    expect(b.conn.texts().filter((t) => t.startsWith('Ana:'))).toEqual([]);
    say(adm.pid, '/unmute 1');
    say(a.pid, 'voltei');
    expect(b.conn.texts()).toContain('Ana: voltei');
    expect(audit.map((e) => [e.action, e.actor.name, e.target?.name])).toEqual([
      ['mute', 'Chefe', 'Ana'],
      ['unmute', 'Chefe', 'Ana'],
    ]);
  });

  it('smute: o alvo não sabe e só ele vê as próprias mensagens', () => {
    const { join, say } = setup();
    const a = join('Ana');
    const b = join('Bia');
    const adm = join('Chefe', { admin: true, accountId: 'u-1' });
    say(adm.pid, '/smute 1');
    expect(a.conn.of('playerMute')).toHaveLength(0);
    expect(b.conn.of('playerMute')).toHaveLength(1);
    say(a.pid, 'alguém aí?');
    expect(a.conn.texts()).toContain('Ana: alguém aí?');
    expect(b.conn.texts()).not.toContain('Ana: alguém aí?');
  });

  it('kick: aviso a todos, contagem dos últimos 5 s e desconexão após 10 s', () => {
    const { join, say, r, audit } = setup();
    const a = join('Ana');
    const adm = join('Chefe', { admin: true, accountId: 'u-1' });
    say(adm.pid, '/kick 1 xingou');
    expect(adm.conn.of('playerKick')).toEqual([expect.objectContaining({ pid: a.pid, minutes: 0, admin: 'Chefe' })]);
    expect(a.conn.texts()).toContain('Reason: xingou');
    for (let i = 0; i < 98; i++) r.tick();
    expect(a.conn.closed).toBeNull();
    expect(a.conn.of('disconnecting').map((m) => m.seconds)).toEqual([5, 4, 3, 2, 1]);
    r.tick();
    expect(a.conn.closed?.[1]).toBe('kicked');
    expect(audit.at(-1)).toMatchObject({ action: 'kick', reason: 'xingou', target: { name: 'Ana' } });
  });

  it('ban: duração e motivo, não volta a entrar; limites do original', () => {
    const { join, say, r, audit } = setup();
    const a = join('Ana', { accountId: 'u-2', ip: '10.0.0.2' });
    const adm = join('Chefe', { admin: true, accountId: 'u-1' });
    say(adm.pid, '/ban 2');
    expect(adm.conn.texts().at(-1)).toBe("You can't ban yourself.");
    say(adm.pid, '/ban 1 20000');
    expect(adm.conn.texts().at(-1)).toBe('The ban time must be more than 0 and at most 10 000 minutes (1 week).');
    say(adm.pid, '/ban x');
    expect(adm.conn.texts().at(-1)).toBe('Syntax error. Expecting "/ban ID [minutes]".');
    say(adm.pid, '/ban 9');
    expect(adm.conn.texts().at(-1)).toBe('No such player. Type /list for a list of IDs.');
    say(adm.pid, '/ban 1 30 spam no chat');
    expect(audit.at(-1)).toMatchObject({ action: 'ban', reason: 'spam no chat', durationSeconds: 1800, target: { account: 'u-2' } });
    for (let i = 0; i < 100; i++) r.tick();
    expect(a.conn.closed).not.toBeNull();
    expect(r.join(new TestConnection(), { name: 'Ana', accountId: 'u-2' })).toMatchObject({ ok: false, reason: 'banned' });
    expect(r.join(new TestConnection(), { name: 'Outra', accountId: null, ip: '10.0.0.2' })).toMatchObject({ ok: false, reason: 'banned' });
  });

  it('/forcemap troca para o mapa votado pelo admin, ou reinicia', () => {
    const { join, say, r } = setup();
    join('Ana');
    const adm = join('Chefe', { admin: true, accountId: 'u-1' });
    say(adm.pid, '/forcemap');
    expect(adm.conn.texts()).toContain("Chefe decided it's time for a restart.");
    expect(adm.conn.of('mapChange').at(-1)?.mapIndex).toBe(0);
    r.handle(adm.pid, [message('mapVote', { map: 1 })]);
    say(adm.pid, '/forcemap');
    expect(adm.conn.texts()).toContain("Chefe decided it's time for a map change.");
    expect(adm.conn.of('mapChange').at(-1)?.mapIndex).toBe(1);
  });

  it('/set muda a regra na hora, avisa os clientes e é auditado; Ranked não aceita', () => {
    const { join, say, r, audit } = setup();
    const a = join('Ana');
    const adm = join('Chefe', { admin: true, accountId: 'u-1' });
    say(adm.pid, '/set capture_limit');
    expect(adm.conn.texts().at(-1)).toBe('capture_limit = 8.');
    say(adm.pid, '/set capture_limit 3');
    expect(r.settings.world.captureLimit).toBe(3);
    expect(a.conn.of('serverSettings').at(-1)?.gamemod).toBe('capture_limit 3');
    expect(audit.at(-1)).toMatchObject({ action: 'set', details: { line: 'capture_limit 3' } });
    say(adm.pid, '/set server_name X');
    expect(adm.conn.texts().at(-1)).toBe("You don't have permission to access the setting server_name.");
    say(adm.pid, '/set reset');
    expect(r.settings.world.captureLimit).toBe(8);

    const ranked = setup('ranked');
    const radm = ranked.join('Chefe', { admin: true, accountId: 'u-1' });
    ranked.say(radm.pid, '/set capture_limit 3');
    expect(radm.conn.texts().at(-1)).toBe('Unknown command set. Type /help for a list.');
  });

  it('/sayadmin só com sayadmin_enabled; a mensagem vai para a auditoria', () => {
    const { join, say, r, audit } = setup();
    const a = join('Ana');
    say(a.pid, '/sayadmin oi');
    expect(a.conn.texts().at(-1)).toBe('Unknown command sayadmin. Type /help for a list.');
    r.settings.server.sayadminEnabled = true;
    say(a.pid, '/sayadmin o mapa travou');
    expect(a.conn.texts().at(-1)).toBe('Your message has been logged. Thank you for your feedback!');
    expect(audit.at(-1)).toMatchObject({ action: 'sayadmin', reason: 'o mapa travou', actor: { name: 'Ana' } });
  });
});

describe('/report (OG-104)', () => {
  it('denuncia pelo nome (com espaços), com motivo; vai para a moderação com IP e dispositivo do alvo', () => {
    const reports: PlayerReport[] = [];
    const { r, join, say } = setup('classic', { reportPlayer: (x) => reports.push(x) });
    const a = join('Ana');
    join('Bia Lima', { ip: '10.0.0.2', device: 'abc123', accountId: '11111111-1111-1111-1111-111111111111' });
    say(a.pid, '/report bia lima atravessa paredes');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ roomId: 'r', reason: 'atravessa paredes', reporter: { name: 'Ana' }, target: { name: 'Bia Lima', ip: '10.0.0.2', device: 'abc123' } });
    expect(a.conn.texts().at(-1)).toBe('Bia Lima has been reported to the moderators. Thank you!');
    expect(r.playerCount).toBe(2);
  });

  it('sem motivo, a si mesmo ou a quem não existe: só a ajuda', () => {
    const reports: PlayerReport[] = [];
    const { join, say } = setup('classic', { reportPlayer: (x) => reports.push(x) });
    const a = join('Ana');
    join('Bia');
    say(a.pid, '/report Bia');
    say(a.pid, '/report Ana trapaça');
    say(a.pid, '/report Zé trapaça');
    expect(reports).toHaveLength(0);
    expect(a.conn.texts().filter((t) => t.startsWith('For example to report'))).toHaveLength(3);
  });

  it('uma denúncia por alvo e no máximo 3 a cada 10 minutos', () => {
    const reports: PlayerReport[] = [];
    const { r, join, say } = setup('classic', { reportPlayer: (x) => reports.push(x) });
    const a = join('Ana');
    for (const n of ['B1', 'B2', 'B3', 'B4']) join(n);
    say(a.pid, '/report B1 x');
    say(a.pid, '/report B1 de novo');
    say(a.pid, '/report B2 x');
    say(a.pid, '/report B3 x');
    say(a.pid, '/report B4 x');
    expect(reports.map((x) => x.target.name)).toEqual(['B1', 'B2', 'B3']);
    expect(a.conn.texts().filter((t) => t.startsWith('You have reported too many'))).toHaveLength(2);
    expect(r.playerCount).toBe(5);
  });

  it('a janela de 10 minutos libera novas denúncias', () => {
    const limiter = new ReportLimiter();
    const p = (uid: number, name: string): ConsolePlayer => ({ pid: uid, uid, name, team: 0, account: null, admin: false, muted: 0, bot: false, ranked: false });
    const me = p(1, 'Ana');
    expect([2, 3, 4, 5].map((n) => limiter.allow(me, p(n, `B${n}`), 0))).toEqual([true, true, true, false]);
    expect(limiter.allow(me, p(5, 'B5'), 5999)).toBe(false);
    expect(limiter.allow(me, p(5, 'B5'), 6000)).toBe(true);
    expect(limiter.allow(me, p(2, 'B2'), 6000)).toBe(true);
  });
});

describe('/carnage (OG-290, D-52)', () => {
  it('dono liga e desliga; jogador comum não pode; desligar volta aos valores de antes', () => {
    const { r, join, say } = setup();
    const a = join('Ana');
    const dono = join('Dono', { owner: true, accountId: 'u-2' });
    r.tick();
    const before = { ...r.settings.powerups };
    const real = () => r.world.items.filter((it) => it.isReal()).length;
    const itemsBefore = real();
    say(a.pid, '/carnage on');
    expect(a.conn.texts().at(-1)).toBe('Unknown command carnage. Type /help for a list.');

    say(dono.pid, '/carnage on');
    expect(dono.conn.texts().at(-1)).toBe('Dono turned carnage mode on: power-ups everywhere, long duration.');
    const p = r.settings.powerups;
    expect([p.pupsMin, p.pupsMinPercentage, p.pupsMax, p.pupsRespawnTime, p.pupsDropAtDeath, p.pupAddTime, p.pupMaxTime]).toEqual([32, false, 32, 0, true, 90, 300]);
    r.tick();
    expect(real()).toBeGreaterThan(itemsBefore); // os que faltavam entram já, sem esperar uma coleta
    say(dono.pid, '/carnage on');
    expect(dono.conn.texts().at(-1)).toBe('Carnage mode is already on.');

    say(dono.pid, '/carnage off');
    expect(a.conn.texts().at(-1)).toBe('Dono turned carnage mode off.');
    expect(r.settings.powerups).toEqual(before);
    say(dono.pid, '/carnage');
    expect(dono.conn.texts().at(-1)).toBe('Carnage mode is off. Use /carnage on or /carnage off.');
  });
});
