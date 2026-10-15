-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-268 (RN-RKL-24, D-48): hall da fama. Na virada da temporada, junto da classificação final
-- (OG-267), guarda os 3 primeiros do geral, de cada formato e dos clãs, com o nome da época. O clã
-- apagado continua no hall (só perde o link); conta apagada sai dele.
CREATE TABLE season_champions (
  season_id integer NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
  board text NOT NULL CHECK (board IN ('overall', '3x3', '4x4', '5x5', 'clans')),
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  clan_id uuid REFERENCES clans (id) ON DELETE SET NULL,
  -- nome do jogador ou tag do clã, e o nome do clã, como eram no fim da temporada
  name text NOT NULL,
  clan_name text,
  -- rating (jogadores) ou pontos (clãs)
  value double precision NOT NULL,
  PRIMARY KEY (season_id, board, position),
  CHECK ((board = 'clans') = (user_id IS NULL))
);
CREATE INDEX season_champions_user_idx ON season_champions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX season_champions_clan_idx ON season_champions (clan_id) WHERE clan_id IS NOT NULL;
