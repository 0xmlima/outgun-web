#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Roda os testes E2E (OG-101). Precisa do build (`pnpm build`). Sem E2E_DATABASE_URL, sobe um
# PostgreSQL 16 descartável no Docker (porta 55433) e o remove no fim. Argumentos vão para o
# Playwright (ex.: --headed, --debug).
set -uo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
if [ -z "${E2E_DATABASE_URL:-}" ]; then
  docker rm -f outgun-e2e-pg >/dev/null 2>&1
  docker run -d --rm --name outgun-e2e-pg -e POSTGRES_USER=outgun -e POSTGRES_PASSWORD=outgun -e POSTGRES_DB=outgun -p 55433:5432 postgres:16-alpine >/dev/null || exit 1
  trap 'docker rm -f outgun-e2e-pg >/dev/null 2>&1' EXIT
  for _ in $(seq 1 60); do docker exec outgun-e2e-pg pg_isready -U outgun >/dev/null 2>&1 && break; sleep 0.5; done
  sleep 1
  export E2E_DATABASE_URL=postgres://outgun:outgun@localhost:55433/outgun
fi
npx playwright test "$@"
