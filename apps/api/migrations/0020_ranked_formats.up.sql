-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-250 (RN-RKL-01..03, D-41): formato (3x3/4x4/5x5) e série (md1/md3/md5) do Ranked. A sala guarda
-- os dois; cada jogo é uma partida ranqueada normal, ligada à série com o número do jogo. A série só
-- agrupa: placar por lado (os lados podem mudar entre jogos) e o vencedor quando acaba. Partidas e
-- salas antigas ficam sem formato.
CREATE TYPE ranked_format AS ENUM ('3x3', '4x4', '5x5');

ALTER TABLE rooms
  ADD COLUMN format ranked_format,
  ADD COLUMN best_of smallint CHECK (best_of IN (1, 3, 5)),
  ADD CONSTRAINT rooms_format_series_check CHECK ((format IS NULL) = (best_of IS NULL) AND (format IS NULL OR mode = 'ranked'));

CREATE TABLE ranked_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id text NOT NULL,
  server_series_id text NOT NULL,
  room_id text REFERENCES rooms (id) ON DELETE SET NULL,
  format ranked_format NOT NULL,
  best_of smallint NOT NULL CHECK (best_of IN (1, 3, 5)),
  games smallint NOT NULL DEFAULT 0,
  red_wins smallint NOT NULL DEFAULT 0,
  blue_wins smallint NOT NULL DEFAULT 0,
  winner smallint CHECK (winner IN (0, 1)),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ranked_series_server_idx ON ranked_series (server_id, server_series_id);

ALTER TABLE matches
  ADD COLUMN format ranked_format,
  ADD COLUMN series_id uuid REFERENCES ranked_series (id) ON DELETE SET NULL,
  ADD COLUMN game_no smallint CHECK (game_no BETWEEN 1 AND 5);
CREATE INDEX matches_series_idx ON matches (series_id) WHERE series_id IS NOT NULL;
CREATE INDEX matches_format_idx ON matches (format) WHERE format IS NOT NULL;
