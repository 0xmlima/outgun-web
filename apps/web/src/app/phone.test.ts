// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { isPortalPath } from './phone.js';

describe('portão do celular (OG-417, D-80)', () => {
  it('abre as telas do portal', () => {
    for (const path of ['/', '/ranking', '/hall-da-fama', '/players', '/players/fulano', '/clans', '/clans/DK', '/clans/new', '/clans/inbox', '/matches/42', '/series/7', '/rooms/abc/report', '/account', '/account/password', '/login', '/register', '/admin', '/feedback', '/help'])
      expect(isPortalPath(path), path).toBe(true);
  });
  it('deixa a partida e o que leva a ela no computador', () => {
    for (const path of ['/play', '/spectate', '/replay', '/replays', '/rooms', '/rooms/new', '/rooms/ranked/new', '/rooms/abc', '/options', '/options/hud', '/options/video', '/download', '/dev/ui'])
      expect(isPortalPath(path), path).toBe(false);
  });
});
