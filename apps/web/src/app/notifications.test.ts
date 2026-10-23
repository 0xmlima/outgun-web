// SPDX-License-Identifier: GPL-2.0-or-later
import { translate } from '@outgun/i18n';
import { describe, expect, it } from 'vitest';
import { notificationPath, notificationText, type AppNotification } from './notifications.js';

const t = (text: string, ...args: string[]) => translate('pt-BR', text, ...args);
const base = { id: '1', createdAt: '2026-10-22T12:00:00Z', read: false } as const;

describe('notificações (OG-361)', () => {
  it('texto e destino do convite e do pedido de entrada', () => {
    const invite: AppNotification = { ...base, kind: 'clan_invite', data: { clanTag: 'LB', clanName: 'Lobos', from: 'Chefe' } };
    const request: AppNotification = { ...base, kind: 'clan_request', data: { clanTag: 'LB', clanName: 'Lobos', from: 'Bia' } };
    expect(notificationText(invite, t)).toBe('Chefe convidou você para o clã (LB) Lobos');
    expect(notificationText(request, t)).toBe('Bia pediu para entrar em (LB) Lobos');
    expect([notificationPath(invite), notificationPath(request)]).toEqual(['/clans/inbox', '/clans/LB']);
  });

  it('marcos novos (OG-394): nomes no idioma, "+N" depois de 3 e destaque do secreto', () => {
    const one: AppNotification = { ...base, kind: 'milestone', data: { milestones: ['hat_trick'] } };
    const many: AppNotification = { ...base, kind: 'milestone', data: { milestones: ['wins_1', 'hat_trick', 'shutout', 'multi_kill', 'carry_60'] } };
    const secret: AppNotification = { ...base, kind: 'milestone', data: { milestones: ['secret_ace'], secretNames: { secret_ace: { 'pt-BR': 'Ás', en: 'Ace' } } } };
    expect(notificationText(one, t, 'pt-BR')).toBe('Marco novo: Hat-trick');
    expect(notificationText(many, t, 'pt-BR')).toBe('Marcos novos: Primeira vitória, Hat-trick, Sem chance +2');
    expect(notificationText(secret, t, 'pt-BR')).toBe('Marco secreto desbloqueado! Ás');
    expect([notificationPath(one, 'Bia'), notificationPath(one)]).toEqual(['/players/Bia', '/']);
  });
});

