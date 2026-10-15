-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-258 (RN-RKL-13, D-42): rating por formato. `ratings` continua sendo o geral (soma dos três
-- formatos mais o acumulado de antes dos formatos, que entra só nele); `format_ratings` guarda cada
-- formato. O que já foi jogado com formato (OG-250) é copiado das partidas e dos deltas de saída.
CREATE TABLE format_ratings (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  season_id integer NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
  format ranked_format NOT NULL,
  score double precision NOT NULL DEFAULT 0,
  neg integer NOT NULL DEFAULT 0,
  matches integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_id, format)
);
CREATE INDEX format_ratings_board_idx ON format_ratings (season_id, format);

INSERT INTO format_ratings (user_id, season_id, format, score, neg, matches)
SELECT user_id, season_id, format, sum(score), sum(neg)::int, sum(matches)::int
FROM (
  SELECT mp.user_id, m.season_id, m.format, mp.score_delta AS score, mp.neg_delta AS neg, 1 AS matches
  FROM match_players mp JOIN matches m ON m.id = mp.match_id
  WHERE m.ranked AND m.format IS NOT NULL AND m.season_id IS NOT NULL AND mp.user_id IS NOT NULL
  UNION ALL
  SELECT d.user_id, d.season_id, r.format, d.score_delta, d.neg_delta, 0
  FROM rating_deltas d JOIN rooms r ON r.id = d.room_id
  WHERE r.format IS NOT NULL AND d.season_id IS NOT NULL AND d.user_id IS NOT NULL
) t
GROUP BY user_id, season_id, format;
