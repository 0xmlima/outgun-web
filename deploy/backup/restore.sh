#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Restaura um backup do backup.sh num banco (OG-103). Apaga o que existir no destino: exige
# RESTORE_CONFIRM=sim. Uso: DATABASE_URL=... RESTORE_CONFIRM=sim restore.sh arquivo.dump
set -eu
[ "${RESTORE_CONFIRM:-}" = "sim" ] || { echo "restore apaga o banco de destino; rode com RESTORE_CONFIRM=sim" >&2; exit 2; }
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction --dbname="$DATABASE_URL" "$1"
echo "restaurado: $1"
