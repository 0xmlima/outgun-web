// SPDX-License-Identifier: GPL-2.0-or-later
// Carga do portal ao vivo (OG-284): abre N conexões SSE em `/live` e mede quantas ficam de pé e
// a memória da API (RSS do processo, lido de /proc pelo PID ou informado à mão). Uso:
//   node tools/load/live.mjs http://localhost:7800 1000 [pid-da-api]
// A API precisa de LIVE_PER_IP acima de N (todas as conexões saem do mesmo IP).
import { request } from 'node:http';
import { execFileSync } from 'node:child_process';

const [base = 'http://localhost:7800', count = '500', pid] = process.argv.slice(2);
const n = Number(count);
const rss = () =>
  pid ? Number(execFileSync('ps', ['-o', 'rss=', '-p', pid]).toString().trim()) / 1024 : NaN;

const before = rss();
let open = 0;
let refused = 0;
const conns = [];
await Promise.all(
  Array.from(
    { length: n },
    () =>
      new Promise((resolve) => {
        const req = request(
          `${base}/live`,
          { headers: { origin: 'http://localhost:5173' } },
          (res) => {
            if (res.statusCode !== 200) {
              refused++;
              res.resume();
              return resolve();
            }
            res.once('data', () => {
              open++;
              resolve();
            });
          },
        );
        req.on('error', () => {
          refused++;
          resolve();
        });
        req.end();
        conns.push(req);
      }),
  ),
);
await new Promise((r) => setTimeout(r, 2000));
const after = rss();
console.log(
  JSON.stringify({
    requested: n,
    open,
    refused,
    rssBeforeMiB: Math.round(before),
    rssAfterMiB: Math.round(after),
    perConnKiB: Number.isFinite(after)
      ? Math.round(((after - before) * 1024) / Math.max(1, open))
      : null,
  }),
);
for (const c of conns) c.destroy();
