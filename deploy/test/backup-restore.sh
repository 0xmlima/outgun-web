#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Teste de restore (OG-103): com a homologação no ar e com dados (rode o E2E antes), faz o backup do
# banco, restaura num PostgreSQL novo e vazio, compara o conteúdo tabela a tabela (contagem e
# checksum) e sobe a API de produção apontando para o banco restaurado.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
net=outgun-staging_default
work=$(mktemp -d)
trap 'docker rm -f outgun-restore-pg >/dev/null 2>&1; rm -rf "$work"' EXIT
pg() { docker run --rm --network "$net" -v "$work:/backup" -v "$PWD/backup:/scripts:ro" -e DATABASE_URL="$1" -e RESTORE_CONFIRM=sim postgres:16-alpine sh -c "$2"; }
tables="users sessions player_profiles seasons rooms game_servers matches match_players ratings rating_deltas bans admin_actions player_reports password_resets reserved_names schema_migrations"
summary() {
  for t in $tables; do
    docker run --rm --network "$net" postgres:16-alpine psql "$1" -tAc "SELECT '$t', count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM $t x"
  done
}
src=postgres://outgun:outgun@postgres:5432/outgun
dst=postgres://outgun:outgun@outgun-restore-pg:5432/outgun

pg "$src" "sh /scripts/backup.sh"
dump=$(ls "$work"/outgun-*.dump)
docker run -d --rm --name outgun-restore-pg --network "$net" -e POSTGRES_USER=outgun -e POSTGRES_PASSWORD=outgun -e POSTGRES_DB=outgun postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do docker exec outgun-restore-pg pg_isready -U outgun >/dev/null 2>&1 && break; sleep 0.5; done
sleep 1
pg "$dst" "sh /scripts/restore.sh /backup/$(basename "$dump")"

summary "$src" > "$work/antes.txt"
summary "$dst" > "$work/depois.txt"
column -t -s '|' "$work/antes.txt" | awk '{print "  " $1, $2, "linhas"}'
if ! diff "$work/antes.txt" "$work/depois.txt"; then echo "FALHA: o banco restaurado difere do original"; exit 1; fi
echo "conteúdo idêntico em $(wc -l < "$work/antes.txt" | tr -d ' ') tabelas"

# a API de produção sobe no banco restaurado e não acha migration pendente
docker run --rm --network "$net" --env-file .env.staging -e DATABASE_URL="$dst" outgun-api:dev node dist/cli.js migrate status
echo "restore testado: OK"
