// SPDX-License-Identifier: GPL-2.0-or-later
import { translate } from '@outgun/i18n';
import { message } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { chatPrompt, MessageFeed, parseFormatted, splitToLines, translateFormatted, type FeedContext } from './feed.js';

const en = (text: string, ...args: string[]) => translate('en', text, ...args);
const pt = (text: string, ...args: string[]) => translate('pt-BR', text, ...args);
const ctx: FeedContext = {
  me: 0,
  teamOf: (pid) => (pid < 8 ? 0 : 1),
  name: (pid) => ['Ana', 'Cid'][pid] ?? (pid === 8 ? 'Bia$' : ''),
  frags: () => 3,
  time: 10,
  captureLimit: 8,
  timeLimit: 0,
};
const text = (feed: MessageFeed) => feed.lines.map((l) => l.parts.map((p) => p.text).join(''));

describe('texto formatado', () => {
  it('parse: cores aninhadas, $$ literal', () => {
    expect(parseFormatted('$RAna$> GOT THE $BBLUE FLAG$>! 5$$')).toEqual([
      { text: 'Ana', color: 'red' },
      { text: ' GOT THE ', color: 'default' },
      { text: 'BLUE FLAG', color: 'blue' },
      { text: '! 5$', color: 'default' },
    ]);
  });

  it('quebra em 79 colunas com continuação recuada', () => {
    const lines = splitToLines([{ text: 'palavra '.repeat(15), color: 'default' }]);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.[0]?.text).toBe('    ');
    expect(lines.every((l) => l.reduce((n, p) => n + p.text.length, 0) <= 79)).toBe(true);
  });

  it('tradução: com cor quando existe; senão a versão sem cor', () => {
    const tf = translateFormatted(pt);
    expect(tf('$1 GOT THE $RRED FLAG$>!', 'X')).toBe('X PEGOU A BANDEIRA $RVERMELHA$>!');
    expect(translateFormatted((k, ...a) => translate('fi', k, ...a))('$1 GOT THE $RRED FLAG$>!', 'X')).toBe('X OTTI PUNAISEN LIPUN!');
    expect(translateFormatted(en)('$1 GOT THE $RRED FLAG$>!', 'X')).toBe('X GOT THE $RRED FLAG$>!');
  });
});

describe('MessageFeed', () => {
  it('mortes, bandeiras e capturas como o original', () => {
    const feed = new MessageFeed(en);
    feed.onMessage(message('kill', { attacker: 8, target: 0, cause: 'rocket', carriedFlag: 'enemy', carrierDefended: false, flagDefended: false }), ctx);
    feed.onMessage(message('flagTake', { pid: 1, flag: 'enemy' }), ctx);
    feed.onMessage(message('capture', { pid: 1, flagTeam: 'blue', assistant: 255 }), ctx);
    feed.onMessage(message('flagReturn', { pid: 8 }), ctx);
    expect(text(feed)).toEqual([
      'Ana was nailed by Bia$.',
      'Ana LOST THE BLUE FLAG!',
      'Cid GOT THE BLUE FLAG!',
      'Cid CAPTURED THE BLUE FLAG!',
      'Bia$ RETURNED THE BLUE FLAG!',
    ]);
    expect(feed.lines[0]?.parts[0]).toEqual({ text: 'Ana', color: 'red' });
  });

  it('sequência de 10 mortes e o fim dela', () => {
    const feed = new MessageFeed(en);
    for (let i = 0; i < 10; i++) feed.onMessage(message('kill', { attacker: 0, target: 8, cause: 'rocket', carriedFlag: 'none', carrierDefended: false, flagDefended: false }), ctx);
    expect(text(feed).at(-1)).toBe('Ana is on a killing spree!');
    feed.onMessage(message('kill', { attacker: 8, target: 0, cause: 'deathbringer', carriedFlag: 'none', carrierDefended: false, flagDefended: false }), ctx);
    expect(text(feed).slice(-2)).toEqual(['Ana was choked by Bia$.', "Ana's killing spree was ended by Bia$."]);
  });

  it('entrada só anuncia quem chega depois; chat com o time do remetente', () => {
    const feed = new MessageFeed(pt);
    feed.onMessage(message('playersPresent', { pids: [0, 8] }), ctx);
    feed.onMessage(message('playerJoined', { pid: 8, name: 'Bia', color: 0, bot: false }), ctx);
    feed.onMessage(message('playerJoined', { pid: 1, name: 'Cid', color: 0, bot: false }), ctx);
    feed.onMessage(message('text', { kind: 'team', from: 8, text: 'Bia: $5 vem' }), ctx);
    expect(text(feed)).toEqual(['Cid entrou no jogo.', 'Bia: $5 vem']);
    expect(feed.lines[1]).toMatchObject({ type: 'team', team: 1 });
  });

  it('linhas visíveis: últimas N e só as dos últimos 80 s sem Insert', () => {
    const feed = new MessageFeed(en);
    feed.push('info', 'velha', 0);
    feed.push('info', 'nova', 50);
    expect(feed.visible(5, 85, false).map((l) => l.parts[0]?.text)).toEqual(['nova']);
    expect(feed.visible(5, 85, true)).toHaveLength(2);
    expect(feed.visible(1, 10, true).map((l) => l.parts[0]?.text)).toEqual(['nova']);
  });

  it('fim de partida com o placar e o objetivo', () => {
    const feed = new MessageFeed(en);
    feed.gameOverScores(3, 8, ctx);
    expect(text(feed)).toEqual(['CTF GAME OVER - FINAL SCORE: RED 3 - BLUE 8', 'CAPTURE 8 FLAGS TO WIN THE GAME.']);
  });

  it('prompt do chat', () => {
    expect(chatPrompt('.vamos', en).text).toBe('Say team: vamos');
    expect(chatPrompt('/help', en).text).toBe('Command: /help');
    expect(chatPrompt('', en).cursor).toBe(-1);
  });
});
