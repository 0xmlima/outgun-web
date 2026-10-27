-- SPDX-License-Identifier: GPL-2.0-or-later
-- Estatísticas de queries para o monitoramento do banco (OG-453). Só coleta com o Postgres
-- iniciado com shared_preload_libraries=pg_stat_statements (deploy/vps/compose.yml); sem isso a
-- extensão existe, mas a visão recusa leitura, e nada mais muda.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
