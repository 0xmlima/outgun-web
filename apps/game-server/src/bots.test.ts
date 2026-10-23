// SPDX-License-Identifier: GPL-2.0-or-later
import { GlibcRand } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { createBotName, neededBots, randomName, type BotNeeds } from './bots.js';

/** Saída de src/names.cpp compilado no oráculo (g++ do Docker), `srand(seed)` e 6 nomes seguidos. */
const GOLDEN: Record<string, string[]> = {"c1": ["Zyyradoi Gaqa", "Teeo Touha", "Ise", "Vae Xaivo", "Bewmliwu", "Uga"], "c2": ["Sine Jroan", "Amsu Zi", "Dimo", "Mlowi", "Opuiso", "Vlurozry"], "c3": ["Talhawmu", "Pzoior", "Nozoew Sosnyafl", "Uileulca", "Fawau", "Jae"]};

describe('RN-BOT-03: nomes como src/names.cpp', () => {
  for (const seed of [1, 2, 3]) {
    it(`clássico, seed ${seed}`, () => {
      const rng = new GlibcRand(seed);
      expect(Array.from({ length: 6 }, () => randomName(rng))).toEqual(GOLDEN[`c${seed}`]);
    });
  }
  it('prefixo BOT, sem repetir o nome de um bot presente, até 15 caracteres', () => {
    const reserved = new Set<string>();
    const first = createBotName(new GlibcRand(1), reserved, []);
    expect(first).toBe('BOT Zyyradoi Ga');
    expect(createBotName(new GlibcRand(1), reserved, [first])).not.toBe(first);
    expect(createBotName(new GlibcRand(1), new Set(), ['BOT Zyyradoi Gaqa'])).toBe('BOT Teeo Touha');
    for (let i = 0; i < 200; i++) expect(createBotName(new GlibcRand(i), new Set(), []).length).toBeLessThanOrEqual(15);
  });
});

describe('OG-403: nomes e prefixos da moderação', () => {
  const names = { prefixes: ['BOT-'], names: ['Ana', 'Bia', 'Carla'] };
  it('prefixo + um nome da lista, sem repetir na sala nem colidir com quem está nela', () => {
    const reserved = new Set<string>();
    const rng = new GlibcRand(7);
    const got = [createBotName(rng, reserved, [], names), createBotName(rng, reserved, ['bia*'], names)];
    for (const n of got) expect(n).toMatch(/^BOT-(Ana|Bia|Carla)$/);
    expect(new Set(got).size).toBe(2);
    expect(createBotName(new GlibcRand(1), new Set(), ['xX Ana', 'Bia', 'Carla'], names)).not.toMatch(/Ana|Bia|Carla/);
  });
  it('nomes esgotados: o gerador com o prefixo da moderação; sem prefixo cadastrado, "BOT "', () => {
    expect(createBotName(new GlibcRand(1), new Set(['ana', 'bia', 'carla']), [], names)).toBe('BOT-Zyyradoi Ga');
    expect(createBotName(new GlibcRand(1), new Set(), [], { prefixes: [], names: [] })).toBe('BOT Zyyradoi Ga');
  });
  it('vários prefixos (inclusive o vazio) sorteados; nome final cabe em 15 caracteres', () => {
    const many = { prefixes: ['', '[BR]', 'xX'], names: ['Fulano', 'NomeBemComprido'] };
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const n = createBotName(new GlibcRand(i), new Set(), [], many);
      expect(n.length).toBeLessThanOrEqual(15);
      seen.add(n.replace(/Fulano|NomeBemComprido/, ''));
    }
    expect([...seen].sort()).toEqual(['', '[BR]', 'xX']);
  });
});

describe('RN-BOT-01: bots necessários (init_bots)', () => {
  const base: BotNeeds = { humans: 1, maxPlayers: 16, minBots: 0, botsFill: 0, balanceBot: false, extraBots: 0 };
  it('bots_fill completa até N jogadores; min_bots é o piso', () => {
    expect(neededBots({ ...base, botsFill: 6 })).toBe(5);
    expect(neededBots({ ...base, humans: 4, botsFill: 6, minBots: 3 })).toBe(3);
    expect(neededBots({ ...base, humans: 8, botsFill: 6 })).toBe(0);
  });
  it('limitado às vagas; extra_bots soma e pode tirar', () => {
    expect(neededBots({ ...base, humans: 14, minBots: 4 })).toBe(2);
    expect(neededBots({ ...base, botsFill: 4, extraBots: 2 })).toBe(5);
    expect(neededBots({ ...base, botsFill: 4, extraBots: -5 })).toBe(0);
  });
  it('balance_bot deixa o total par (mesmo passando das vagas, como o original)', () => {
    expect(neededBots({ ...base, humans: 3, balanceBot: true })).toBe(1);
    expect(neededBots({ ...base, humans: 2, botsFill: 5, balanceBot: true })).toBe(4);
    expect(neededBots({ ...base, humans: 15, maxPlayers: 16, minBots: 2, balanceBot: true })).toBe(1);
  });
  it('D-27: sem humanos, nenhum bot', () => {
    expect(neededBots({ ...base, humans: 0, minBots: 4, botsFill: 8 })).toBe(0);
  });
});
