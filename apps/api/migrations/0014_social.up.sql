-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-211 e OG-214: privacidade do perfil social (D-39) e índices das consultas sociais (companheiros, rivais,
-- evolução e busca de jogadores).
ALTER TABLE player_profiles ADD COLUMN hide_companions boolean NOT NULL DEFAULT false;
ALTER TABLE player_profiles ADD COLUMN hide_history boolean NOT NULL DEFAULT false;

-- partidas de uma conta com o time (companheiros/rivais sem ler a linha inteira)
CREATE INDEX match_players_user_match_idx ON match_players (user_id, match_id, team) WHERE user_id IS NOT NULL;
-- deltas fora do fim da partida, por conta e temporada (série de evolução)
CREATE INDEX rating_deltas_user_idx ON rating_deltas (user_id, season_id, created_at);
-- busca: prefixo do nome normalizado e clã sem diferenciar maiúsculas
CREATE INDEX users_username_key_prefix_idx ON users (username_key text_pattern_ops);
CREATE INDEX users_clan_idx ON users (lower(clan_tag)) WHERE clan_tag IS NOT NULL;

-- última partida de uma sala ("Ver relatório", OG-214)
CREATE INDEX matches_room_ended_idx ON matches (room_id, ended_at DESC);
