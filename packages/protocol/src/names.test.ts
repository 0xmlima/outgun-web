// SPDX-License-Identifier: GPL-2.0-or-later
// Vetores da spec plan/specs/names.md.
import { describe, expect, it } from 'vitest';
import { chatName, checkClanName, checkClanTag, checkName, checkRegisteredName, comparableName, guestName, makeComparable } from './names.js';

describe('checkName (check_name)', () => {
  it.each([
    ['Jogador', true],
    ['José da Silva', true],
    ['a b', true],
    ['123456789012345', true],
    ['1234567890123456', false],
    ['', false],
    [' ', false],
    ['\u00a0\u00a0', false],
    [' a', false],
    ['a ', false],
    ['a\u00a0', false],
    ['A\tB', false],
    ['A\u0085B', false],
    ['A\u007fB', true],
    ['Ελένη', false],
    ['ÿ~!@#', true],
  ])('%j → %s', (name, ok) => expect(checkName(name)).toBe(ok));
});

describe('makeComparable (original)', () => {
  it.each([
    ['Ana', 'ana'],
    ['..Ana..', 'ana'],
    ['A  B', 'a..b'],
    ['A.B', 'a.b'],
    ['A B', 'a.b'],
    ['!!!', ''],
    ['José', 'jos'],
  ])('%j → %j', (name, out) => expect(makeComparable(name)).toBe(out));
});

describe('comparableName (com acentos dobrados)', () => {
  it('trata acentos, maiúsculas e pontuação nas pontas como o mesmo nome', () => {
    const same = ['José', 'JOSE', 'jose', 'Jose!', '_José_', 'Jösé'];
    expect(new Set(same.map(comparableName))).toEqual(new Set(['jose']));
  });
  it('separadores no meio continuam contando', () => {
    expect(comparableName('Jo Se')).toBe('jo.se');
    expect(comparableName('Jo Se')).not.toBe(comparableName('Jose'));
  });
  it('dobra ligaduras e letras especiais de Latin-1', () => {
    expect(comparableName('Straße')).toBe('strasse');
    expect(comparableName('Ærø')).toBe('aero');
    expect(comparableName('Þór')).toBe('thor');
  });
  it('nome registrável precisa de letra ou dígito', () => {
    expect(checkRegisteredName('!!!')).toBe(false);
    expect(checkRegisteredName('R2-D2')).toBe(true);
  });
});

describe('convidados e clan tag', () => {
  it('convidado recebe o sufixo * e cabe em 15 caracteres', () => {
    expect(guestName('Ana2')).toBe('Ana2*');
    expect(guestName('123456789012345')).toBe('12345678901234*');
    expect(guestName('1234567890123 5')).toBe('1234567890123*');
    expect(checkName(guestName('1234567890123 5'))).toBe(true);
    expect(comparableName(guestName('Ana'))).toBe(comparableName('Ana'));
  });
  it.each([
    ['AB', true],
    ['X', true],
    ['ÄÖ', true],
    ['', false],
    ['ABC', false],
    ['(A)', false],
    [' A', false],
  ])('tag %j → %s', (tag, ok) => expect(checkClanTag(tag)).toBe(ok));
  it.each([
    ['Os Bons', true],
    ['ab', false],
    ['x'.repeat(24), true],
    ['x'.repeat(25), false],
    [' Clã', false],
  ])('nome de clã %j → %s', (name, ok) => expect(checkClanName(name)).toBe(ok));
  it('chat mostra "(TAG) nome"', () => {
    expect(chatName('Ana', 'XYZ')).toBe('(XYZ) Ana');
    expect(chatName('Ana', null)).toBe('Ana');
  });
});
