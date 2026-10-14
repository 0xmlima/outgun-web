#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Backup lógico do PostgreSQL (OG-103): pg_dump em formato custom, com data no nome. Roda numa imagem
# postgres:16 (pg_dump da mesma versão do servidor). Variáveis: DATABASE_URL, BACKUP_DIR (/backup),
# BACKUP_KEEP (14 arquivos locais); com BACKUP_S3_URI (ex. s3://outgun-backups/db) e o aws-cli na
# imagem, também envia para o armazenamento S3 compatível (Tigris no Fly).
set -eu
dir="${BACKUP_DIR:-/backup}"
mkdir -p "$dir"
file="$dir/outgun-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$file.part" "$DATABASE_URL"
mv "$file.part" "$file"
pg_restore --list "$file" >/dev/null # o arquivo abre (não está truncado)
echo "backup: $file ($(du -h "$file" | cut -f1))"
if [ -n "${BACKUP_S3_URI:-}" ]; then aws s3 cp "$file" "$BACKUP_S3_URI/$(basename "$file")"; fi
ls -1t "$dir"/outgun-*.dump | tail -n +"$(( ${BACKUP_KEEP:-14} + 1 ))" | xargs -r rm -f
