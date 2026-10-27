#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Liga as métricas e os logs do servidor no Grafana Cloud (OG-452): copia as credenciais de
# ~/.config/outgun/grafana-cloud.env (fora do repositório) para o /opt/outgun/.env do servidor e
# sobe o Alloy. Rodar de novo troca as credenciais. Uso: bash deploy/vps/grafana-cloud.sh root@IP
#
# O arquivo local tem (Grafana Cloud > a stack > Prometheus e Loki > "Details"; o token é de uma
# access policy com metrics:write e logs:write; as três linhas de baixo servem ao OG-455):
#   GRAFANA_CLOUD_PROM_URL=https://prometheus-prod-XX-prod-sa-east-1.grafana.net/api/prom/push
#   GRAFANA_CLOUD_PROM_USER=1234567
#   GRAFANA_CLOUD_LOKI_URL=https://logs-prod-XXX.grafana.net/loki/api/v1/push
#   GRAFANA_CLOUD_LOKI_USER=7654321
#   GRAFANA_CLOUD_TOKEN=glc_...
#   GRAFANA_URL=https://outgun.grafana.net
#   GRAFANA_SA_TOKEN=glsa_...            (service account do Grafana, papel Editor)
#   GRAFANA_CLOUD_RULES_TOKEN=glc_...    (access policy com rules:read e rules:write)
set -euo pipefail
host="${1:?uso: grafana-cloud.sh root@IP}"
file="${GRAFANA_CLOUD_ENV:-$HOME/.config/outgun/grafana-cloud.env}"
[ -f "$file" ] || { echo "faltou $file (ver o cabeçalho deste script)" >&2; exit 1; }
keys="GRAFANA_CLOUD_PROM_URL GRAFANA_CLOUD_PROM_USER GRAFANA_CLOUD_LOKI_URL GRAFANA_CLOUD_LOKI_USER GRAFANA_CLOUD_TOKEN"
lines=""
for k in $keys; do
  v=$(grep "^$k=" "$file" | head -1 | cut -d= -f2-)
  [ -n "$v" ] || { echo "faltou $k em $file" >&2; exit 1; }
  case "$v" in *[[:space:]\'\"\$\`\\]*) echo "$k tem caractere inválido" >&2; exit 1 ;; esac
  lines+="$k=$v"$'\n'
done
# as credenciais vão pela entrada padrão, não pela linha de comando (não aparecem no ps do servidor)
printf '%s' "$lines" | ssh -o StrictHostKeyChecking=accept-new "$host" 'set -e
cd /opt/outgun
umask 077
while IFS= read -r line; do
  k=${line%%=*}
  grep -v "^$k=" .env > .env.tmp || true
  printf "%s\n" "$line" >> .env.tmp
  mv .env.tmp .env
done
chmod 600 .env
# --no-deps: o .env mudou, e sem isso o compose recriaria a API e o game server
docker compose up -d --no-deps alloy
sleep 5
docker compose ps alloy --format "{{.Service}}: {{.Status}}"
docker compose logs --no-color --since 1m alloy | grep -E "level=(error|warn)" | tail -5 || true'
