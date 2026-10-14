#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Confere a configuração do Prometheus e do Alertmanager e roda os testes das regras de alerta
# (promtool test rules). Precisa do Docker.
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker run --rm -v "$PWD/prometheus:/p:ro" --entrypoint promtool prom/prometheus:v3.5.0 check config /p/prometheus.yml
docker run --rm -v "$PWD/prometheus/rules:/r:ro" --entrypoint promtool prom/prometheus:v3.5.0 test rules /r/outgun.rules.test.yml
docker run --rm -v "$PWD/alertmanager:/a:ro" --entrypoint amtool prom/alertmanager:v0.28.1 check-config /a/alertmanager.yml
node -e "JSON.parse(require('fs').readFileSync('grafana/dashboards/outgun.json','utf8'))" && echo "painel: JSON válido"
