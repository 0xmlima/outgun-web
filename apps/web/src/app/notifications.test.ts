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
});
