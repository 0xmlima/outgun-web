// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import type { Db } from './db/client.js';
import { lastGoodRead } from './platform-config.js';

describe('heartbeat com o banco falhando (OG-512, OUTGUN-SERVER-2)', () => {
  it('responde com a última leitura boa e avisa; sem nenhuma, o erro sobe', async () => {
    const db = {} as Db;
    const warn = vi.fn();
    const failure = new Error('Failed query: select "id" from "casual_presets"', { cause: new Error('connection ended') });
    await expect(lastGoodRead(db, 'panel', () => Promise.reject(failure), warn)).rejects.toBe(failure);
    expect(await lastGoodRead(db, 'panel', async () => ['casual-a'], warn)).toEqual(['casual-a']);
    expect(await lastGoodRead(db, 'panel', () => Promise.reject(failure), warn)).toEqual(['casual-a']);
    expect(warn).toHaveBeenCalledWith(failure);
    // cada banco e cada chave guardam a própria leitura
    await expect(lastGoodRead({} as Db, 'panel', () => Promise.reject(failure), warn)).rejects.toBe(failure);
    await expect(lastGoodRead(db, 'config', () => Promise.reject(failure), warn)).rejects.toBe(failure);
  });
});
