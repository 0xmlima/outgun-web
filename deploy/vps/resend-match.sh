#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Envia à API um resultado de partida (corpo de POST /internal/matches), assinado como o game server,
# para recuperar uma partida que a API recusou (OG-330). O corpo sai de `tools/dev/rebuild-match.mjs`.
# A API é idempotente pelo serverMatchId: reenviar a mesma partida não soma duas vezes.
# Uso: bash deploy/vps/resend-match.sh root@host report.json (DRY_RUN=1 só confere o corpo e a assinatura, sem enviar)
set -euo pipefail
host="${1:?uso: resend-match.sh <usuário@host> <report.json>}"
report="${2:?uso: resend-match.sh <usuário@host> <report.json>}"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).serverMatchId || process.exit(1)' "$report" || { echo "$report não parece um resultado de partida" >&2; exit 1; }
# o script roda dentro do contêiner do game server (GS_ID, GS_SECRET, API_URL e @outgun/tickets já estão lá)
script='
import { signInternalRequest } from "@outgun/tickets";
let body = "";
for await (const chunk of process.stdin) body += chunk;
const path = "/internal/matches";
if (process.argv[1] === "1") {
  const r = JSON.parse(body);
  console.log("DRY_RUN", r.serverMatchId, r.players.length, "jogadores,", body.length, "bytes, assinatura", Object.keys(signInternalRequest(process.env.GS_ID, process.env.GS_SECRET, "POST", path, body)).join(" "));
  process.exit(0);
}
const res = await fetch(process.env.API_URL + path, {
  method: "POST",
  headers: { "content-type": "application/json", "x-request-id": "resend-" + Date.now().toString(36), ...signInternalRequest(process.env.GS_ID, process.env.GS_SECRET, "POST", path, body) },
  body,
});
console.log("HTTP", res.status, await res.text());
process.exit(res.ok ? 0 : 1);
'
ssh "$host" "cd /opt/outgun && docker compose exec -T game-server sh -c 'cd /app && node --input-type=module -e \"\$0\" \"\$1\"' $(printf '%q' "$script") ${DRY_RUN:-0}" < "$report"
