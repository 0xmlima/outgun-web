// SPDX-License-Identifier: GPL-2.0-or-later
import { botChatConfig, DEFAULT_BOT_CHAT, type BotChatConfig } from '@outgun/settings';
import { GlibcRand } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { BotChatTally, BotChatter } from './bot-chat.js';

const BOTS = [
  { pid: 1, team: 0 },
  { pid: 2, team: 0 },
  { pid: 3, team: 1 },
];

function setup(patch: (c: BotChatConfig) => void = () => undefined, seed = 1) {
  const config = botChatConfig(structuredClone(DEFAULT_BOT_CHAT));
  patch(config);
  let now = 0;
  const said: { pid: number; text: string; at: number }[] = [];
  const chatter = new BotChatter({ rng: new GlibcRand(seed), now: () => now, bots: () => BOTS, say: (pid, text) => said.push({ pid, text, at: now }), config: () => config });
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      now += 100;
      chatter.tick();
    }
  };
  return { chatter, said, advance, config };
}
const always = (c: BotChatConfig) => {
  for (const r of Object.values(c.events)) r.chance = 100;
  c.perMinute = 30;
};

describe('chat dos bots (OG-404)', () => {
  it('fala depois de 1 a 4 s, quem está envolvido, com uma mensagem da lista', () => {
    const { chatter, said, advance, config } = setup(always);
    chatter.event('we_captured', { team: 0, involved: 2 });
    advance(900);
    expect(said).toEqual([]);
    advance(3200);
    expect(said).toHaveLength(1);
    expect(said[0]!.pid).toBe(2);
    expect(config.events.we_captured.messages).toContain(said[0]!.text);
    expect(said[0]!.at).toBeGreaterThanOrEqual(1000);
  });

  it('bandeira entregue: fala um bot do time que levou a captura; "{name}" vira o nome', () => {
    const { chatter, said, advance } = setup((c) => {
      always(c);
      c.events.they_captured.messages = ['{name} passou fácil'];
    });
    chatter.event('they_captured', { team: 1, name: 'Fulano' });
    advance(5000);
    expect(said).toEqual([expect.objectContaining({ pid: 3, text: 'Fulano passou fácil' })]);
  });

  it('chance 0% e chat desligado calam', () => {
    const zero = setup((c) => (c.events.win.chance = 0));
    for (let i = 0; i < 50; i++) zero.chatter.event('win', { team: 0 });
    zero.advance(5000);
    expect(zero.said).toEqual([]);
    const off = setup((c) => {
      always(c);
      c.enabled = false;
    });
    off.chatter.event('win', { team: 0 });
    off.advance(5000);
    expect(off.said).toEqual([]);
  });

  it('teto por minuto, sem o mesmo bot duas vezes seguidas e 20 s de espera por bot', () => {
    const { chatter, said, advance } = setup((c) => {
      always(c);
      c.perMinute = 2;
    });
    for (let i = 0; i < 20; i++) {
      chatter.event('match_start');
      advance(1000);
    }
    expect(said).toHaveLength(2);
    expect(said[0]!.pid).not.toBe(said[1]!.pid);
    advance(60_000);
    const before = said.length;
    for (let i = 0; i < 60; i++) {
      chatter.event('match_start');
      advance(1000);
    }
    expect(said.length - before).toBeLessThanOrEqual(3);
    for (let i = 1; i < said.length; i++) expect(said[i]!.pid).not.toBe(said[i - 1]!.pid);
    for (const pid of [1, 2, 3]) {
      const times = said.filter((s) => s.pid === pid).map((s) => s.at);
      for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(20_000 - 4000);
    }
  });

  it('mensagem com {name} sem nome não sai; bot que saiu não fala', () => {
    const { chatter, said, advance } = setup((c) => {
      always(c);
      c.events.player_join.messages = ['eae {name}'];
    });
    chatter.event('player_join');
    advance(5000);
    expect(said).toEqual([]);
    chatter.event('we_captured', { team: 0, involved: 1 });
    chatter.forget(1);
    advance(5000);
    expect(said).toEqual([]);
  });

  it('sequência de 5, morreu 3 vezes para o mesmo e virada no placar', () => {
    const tally = new BotChatTally();
    const streaks = Array.from({ length: 5 }, () => tally.kill(1, 7).streak);
    expect(streaks).toEqual([1, 2, 3, 4, 5]);
    expect(tally.kill(1, 7).repeat).toBe(6);
    expect(tally.kill(7, 1)).toEqual({ streak: 1, repeat: 1 });
    expect(tally.kill(1, 7).streak).toBe(1);
    expect([tally.score(0, 1), tally.score(1, 1), tally.score(2, 1), tally.score(3, 1)]).toEqual([null, null, 0, null]);
    tally.reset();
    expect([tally.score(1, 0), tally.score(2, 0)]).toEqual([null, null]);
  });
});
