-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-086: registro dos game servers (substitui o master server do original). Cada servidor manda
-- heartbeat a cada ~3 s; a API escolhe o menos carregado para abrir salas sob demanda.
CREATE TABLE game_servers (
  id text PRIMARY KEY,
  ws_base_url text NOT NULL,
  region text NOT NULL,
  max_rooms smallint NOT NULL CHECK (max_rooms >= 0),
  rooms smallint NOT NULL DEFAULT 0,
  players smallint NOT NULL DEFAULT 0,
  last_heartbeat_at timestamptz NOT NULL
);
-- Rotação própria das salas privadas (nomes dos mapas); nula = rotação oficial do modo.
ALTER TABLE rooms ADD COLUMN maps text[];
CREATE INDEX rooms_server_idx ON rooms (server_id);
