#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Envia os painéis e as regras de alerta desta pasta ao Grafana Cloud (OG-455). Idempotente:
# sobrescreve os painéis (pasta "Outgun") e sincroniza os namespaces outgun-jogo e outgun-beta do
# ruler. Credenciais em ~/.config/outgun/grafana-cloud.env (formato no cabeçalho de
# deploy/vps/grafana-cloud.sh): GRAFANA_URL, GRAFANA_SA_TOKEN, GRAFANA_CLOUD_PROM_URL,
# GRAFANA_CLOUD_PROM_USER e GRAFANA_CLOUD_RULES_TOKEN. Precisa do Docker (mimirtool).
#
# Os alertas vão para o Alertmanager da stack; o e-mail é configurado uma vez no Grafana Cloud
# (Alerting > Contact points), como diz o deploy/vps/README.md.
set -euo pipefail
cd "$(dirname "$0")"
file="${GRAFANA_CLOUD_ENV:-$HOME/.config/outgun/grafana-cloud.env}"
[ -f "$file" ] || { echo "faltou $file" >&2; exit 1; }
get() { grep "^$1=" "$file" | head -1 | cut -d= -f2-; }
GRAFANA_URL=$(get GRAFANA_URL)
GRAFANA_SA_TOKEN=$(get GRAFANA_SA_TOKEN)
PROM_URL=$(get GRAFANA_CLOUD_PROM_URL)
PROM_USER=$(get GRAFANA_CLOUD_PROM_USER)
RULES_TOKEN=$(get GRAFANA_CLOUD_RULES_TOKEN)
RULER_URL=$(get GRAFANA_CLOUD_RULER_URL)
RULER_URL="${RULER_URL:-${PROM_URL%/push}}"
for v in GRAFANA_URL GRAFANA_SA_TOKEN PROM_URL PROM_USER RULES_TOKEN; do
  [ -n "${!v}" ] || { echo "faltou $v em $file" >&2; exit 1; }
done
export GRAFANA_URL GRAFANA_SA_TOKEN

echo "== painéis"
python3 -I - grafana/dashboards/outgun.json grafana/dashboards/servidor-beta.json <<'EOF'
import json, os, sys, urllib.error, urllib.request

base = os.environ['GRAFANA_URL'].rstrip('/')
headers = {'Authorization': 'Bearer ' + os.environ['GRAFANA_SA_TOKEN'], 'Content-Type': 'application/json'}

def call(method, path, body=None):
    req = urllib.request.Request(base + path, method=method, headers=headers, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')

status, sources = call('GET', '/api/datasources')
if status != 200:
    sys.exit(f'GET /api/datasources: HTTP {status} {sources}')
def pick(kind, suffix):
    found = [s for s in sources if s['type'] == kind and s['name'].endswith(suffix)] or [s for s in sources if s['type'] == kind]
    if not found:
        sys.exit(f'nenhuma fonte de dados {kind} na stack')
    return found[0]['uid']
uids = {'prometheus': pick('prometheus', '-prom'), 'loki': pick('loki', '-logs')}

status, _ = call('POST', '/api/folders', {'uid': 'outgun', 'title': 'Outgun'})
if status not in (200, 409, 412):
    sys.exit(f'POST /api/folders: HTTP {status}')

def rewrite(node):
    if isinstance(node, dict):
        ds = node.get('datasource')
        if isinstance(ds, dict) and ds.get('uid') in ('prometheus', 'loki'):
            ds['uid'] = uids[ds['uid']]
        for v in node.values():
            rewrite(v)
    elif isinstance(node, list):
        for v in node:
            rewrite(v)

for path in sys.argv[1:]:
    dash = json.load(open(path, encoding='utf-8'))
    rewrite(dash)
    dash['id'] = None
    status, res = call('POST', '/api/dashboards/db', {'dashboard': dash, 'folderUid': 'outgun', 'overwrite': True, 'message': 'grafana-cloud-sync.sh'})
    if status != 200:
        sys.exit(f'{path}: HTTP {status} {res}')
    print(f"{dash['title']}: {base}{res['url']}")
EOF

echo "== regras"
command -v docker >/dev/null || export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# o mimirtool lê o namespace do próprio arquivo; as regras da pasta ficam no formato do Prometheus
{ echo 'namespace: outgun-jogo'; cat prometheus/rules/outgun.rules.yml; } > "$tmp/outgun-jogo.yml"
{ echo 'namespace: outgun-beta'; cat prometheus/rules/outgun-beta.rules.yml; } > "$tmp/outgun-beta.yml"
docker run --rm -v "$tmp:/r:ro" -e MIMIR_API_KEY="$RULES_TOKEN" grafana/mimirtool:3.1.7 rules sync \
  --address="$RULER_URL" --id="$PROM_USER" --namespaces=outgun-jogo,outgun-beta /r/outgun-jogo.yml /r/outgun-beta.yml
