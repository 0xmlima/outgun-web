// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSecrets, verifyInternalRequest } from '@outgun/tickets';
import { describe, expect, it } from 'vitest';
import type { ConsolePlayer } from './moderation.js';
import type { MatchReport } from './match-report.js';
import { auditBody, heartbeatBody, PlatformClient } from './platform.js';

const player = (name: string, account: string | null, ip?: string): ConsolePlayer => ({
  pid: 0, uid: 1, name, team: 0, account, admin: false, muted: 0, bot: false, ranked: false, ...(ip ? { ip } : {}),
});
const ACCOUNT = '11111111-2222-4333-8444-555555555555';

describe('auditoria para a API (OG-046)', () => {
  it('monta o corpo: conta só se for uuid, IP só do alvo', () => {
    const body = auditBody('main', { action: 'ban', actor: player('Chefe', ACCOUNT, '1.1.1.1'), target: player('Visita*', 'guest:x', '10.0.0.9'), reason: 'spam', durationSeconds: 600 });
    expect(body).toEqual({
      roomId: 'main',
      action: 'ban',
      actor: { name: 'Chefe', accountId: ACCOUNT },
      target: { name: 'Visita*', ip: '10.0.0.9' },
      reason: 'spam',
      durationSeconds: 600,
    });
  });

  it('assina o pedido com HMAC que a API confere', async () => {
    const got: { ok: boolean; body: unknown }[] = [];
    const server = createServer((req, res) => {
      let data = '';
      req.on('data', (c: Buffer) => (data += c.toString()));
      req.on('end', () => {
        const v = verifyInternalRequest(req.headers, req.method!, req.url!, data, parseSecrets('gs-1:segredo-de-teste-123456'), 30_000);
        got.push({ ok: v.ok, body: JSON.parse(data) });
        res.writeHead(v.ok ? 201 : 401).end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const client = new PlatformClient(url, 'gs-1', 'segredo-de-teste-123456', () => {});
    expect(await client.post('/internal/admin-actions', { a: 1 })).toBe(true);
    const wrong = new PlatformClient(url, 'gs-1', 'outro-segredo-1234567890', () => {});
    expect(await wrong.post('/internal/admin-actions', { a: 2 }, 1)).toBe(false);
    expect(got.map((g) => g.ok)).toEqual([true, false]);
    server.close();
  });
});

describe('heartbeat do registro de salas (OG-086)', () => {
  it('anuncia o servidor e o endereço de cada sala', () => {
    const body = heartbeatBody({ wsBaseUrl: 'wss://gs1.example/', region: 'sa', maxRooms: 20 }, [
      { id: 'main', name: 'Principal', mode: 'casual', preset: 'classic', maxPlayers: 16, persistent: true, players: 3, map: 'Outgun 1', roster: [{ uid: 1, name: 'Ana', team: 0, bot: false, muted: 0 }] },
    ]);
    expect(body).toEqual({
      server: { wsBaseUrl: 'wss://gs1.example', region: 'sa', maxRooms: 20 },
      rooms: [{ id: 'main', name: 'Principal', mode: 'casual', preset: 'classic', maxPlayers: 16, persistent: true, players: 3, map: 'Outgun 1', roster: [{ uid: 1, name: 'Ana', team: 0, bot: false, muted: 0 }], wsUrl: 'wss://gs1.example/rooms/main' }],
    });
  });
});

describe('resultado recusado pela API (OG-331)', () => {
  it('guarda o corpo do resultado que a API recusou; o aceito não', async () => {
    const server = createServer((req, res) => {
      let data = '';
      req.on('data', (c: Buffer) => (data += c.toString()));
      req.on('end', () => res.writeHead(JSON.parse(data).serverMatchId === 'r-1' ? 422 : 201).end('{}'));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const dir = mkdtempSync(join(tmpdir(), 'og331-'));
    const client = new PlatformClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 'gs-1', 'segredo-de-teste-123456', () => {});
    client.keepFailedReports(join(dir, 'failed'));
    const report = (serverMatchId: string) => ({ serverMatchId, players: [] }) as unknown as MatchReport;
    client.reportMatch(report('r-1'));
    client.reportMatch(report('r-2'));
    await client.drain();
    expect(JSON.parse(readFileSync(join(dir, 'failed', 'r-1.json'), 'utf8'))).toMatchObject({ serverMatchId: 'r-1' });
    expect(existsSync(join(dir, 'failed', 'r-2.json'))).toBe(false);
    server.close();
    rmSync(dir, { recursive: true });
  });
});
