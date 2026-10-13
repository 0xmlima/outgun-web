-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-084: participação no ranking (opt-out), deltas fora do fim da partida (idempotentes) e
-- índice do leaderboard (spec plan/specs/ranking.md).
ALTER TABLE player_profiles ADD COLUMN ranking_participation boolean NOT NULL DEFAULT true;

CREATE TABLE rating_deltas (
  server_id text NOT NULL,
  delta_id text NOT NULL,
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  season_id integer REFERENCES seasons (id) ON DELETE CASCADE,
  room_id text REFERENCES rooms (id) ON DELETE SET NULL,
  score_delta integer NOT NULL,
  neg_delta integer NOT NULL CHECK (neg_delta >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, delta_id)
);

CREATE INDEX ratings_leaderboard_idx ON ratings (season_id, ((score + 1) / (neg + 1)) DESC, score DESC);
