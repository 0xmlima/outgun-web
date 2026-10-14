-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-211 e OG-214: privacidade do perfil social (D-39), resumos para as consultas sociais e índices.
-- Os resumos são atualizados na gravação de cada partida (src/social-stats.ts) para que companheiros,
-- rivais e evolução sejam leituras por índice (p95 < 50 ms com 100 mil partidas); aqui, o
-- preenchimento a partir das partidas já gravadas.
ALTER TABLE player_profiles ADD COLUMN hide_companions boolean NOT NULL DEFAULT false;
ALTER TABLE player_profiles ADD COLUMN hide_history boolean NOT NULL DEFAULT false;

-- Pares de contas que jogaram juntas (mesmo time) ou contra (times opostos); uma linha por direção.
CREATE TABLE player_pairs (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  other_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  together integer NOT NULL DEFAULT 0,
  won_together integer NOT NULL DEFAULT 0,
  lost_together integer NOT NULL DEFAULT 0,
  against integer NOT NULL DEFAULT 0,
  won_against integer NOT NULL DEFAULT 0,
  lost_against integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, other_id)
);
CREATE INDEX player_pairs_together_idx ON player_pairs (user_id, together DESC) WHERE together > 0;
CREATE INDEX player_pairs_against_idx ON player_pairs (user_id, against DESC) WHERE against > 0;

-- Totais por dia (UTC) de cada conta: períodos de 7 e 30 dias e "sempre".
CREATE TABLE player_daily (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day date NOT NULL,
  matches integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  kills integer NOT NULL DEFAULT 0,
  deaths integer NOT NULL DEFAULT 0,
  captures integer NOT NULL DEFAULT 0,
  play_seconds integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Cada variação de rating (fim de partida ranqueada ou delta avulso), para a série de evolução.
CREATE TABLE rating_points (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  season_id integer NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
  at timestamptz NOT NULL,
  score_delta double precision NOT NULL,
  neg_delta integer NOT NULL
);
CREATE INDEX rating_points_user_idx ON rating_points (user_id, season_id, at) INCLUDE (score_delta, neg_delta);

INSERT INTO player_pairs (user_id, other_id, together, won_together, lost_together, against, won_against, lost_against)
SELECT a.user_id, b.user_id,
  count(*) FILTER (WHERE a.team = b.team),
  count(*) FILTER (WHERE a.team = b.team AND r.res > 0),
  count(*) FILTER (WHERE a.team = b.team AND r.res < 0),
  count(*) FILTER (WHERE a.team <> b.team),
  count(*) FILTER (WHERE a.team <> b.team AND r.res > 0),
  count(*) FILTER (WHERE a.team <> b.team AND r.res < 0)
FROM match_players a
JOIN match_players b ON b.match_id = a.match_id AND b.user_id IS NOT NULL AND b.user_id <> a.user_id AND NOT b.is_bot
JOIN matches m ON m.id = a.match_id
CROSS JOIN LATERAL (SELECT sign(CASE WHEN a.team = 0 THEN m.red_score - m.blue_score ELSE m.blue_score - m.red_score END) AS res) r
WHERE a.user_id IS NOT NULL AND NOT a.is_bot
GROUP BY a.user_id, b.user_id;

INSERT INTO player_daily (user_id, day, matches, wins, kills, deaths, captures, play_seconds)
SELECT mp.user_id, (m.ended_at AT TIME ZONE 'UTC')::date, count(*),
  count(*) FILTER (WHERE CASE WHEN mp.team = 0 THEN m.red_score > m.blue_score ELSE m.blue_score > m.red_score END),
  sum(mp.kills), sum(mp.deaths), sum(mp.captures), sum(mp.play_seconds)
FROM match_players mp JOIN matches m ON m.id = mp.match_id
WHERE mp.user_id IS NOT NULL
GROUP BY mp.user_id, (m.ended_at AT TIME ZONE 'UTC')::date;

INSERT INTO rating_points (user_id, season_id, at, score_delta, neg_delta)
SELECT mp.user_id, m.season_id, m.ended_at, mp.score_delta, mp.neg_delta
FROM match_players mp JOIN matches m ON m.id = mp.match_id
WHERE mp.user_id IS NOT NULL AND m.ranked AND m.season_id IS NOT NULL
UNION ALL
SELECT user_id, season_id, created_at, score_delta, neg_delta FROM rating_deltas
WHERE user_id IS NOT NULL AND season_id IS NOT NULL;

-- busca: prefixo do nome normalizado e clã sem diferenciar maiúsculas
CREATE INDEX users_username_key_prefix_idx ON users (username_key text_pattern_ops);
CREATE INDEX users_clan_idx ON users (lower(clan_tag)) WHERE clan_tag IS NOT NULL;
-- última partida de uma sala ("Ver relatório", OG-214)
CREATE INDEX matches_room_ended_idx ON matches (room_id, ended_at DESC);
