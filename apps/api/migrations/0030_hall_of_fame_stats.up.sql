-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-354 (D-66, RN-LDB-05): desde a temporada de novembro/2026 o hall da fama guarda os 3 primeiros
-- de cada stat principal do leaderboard ("stat:kills", "stat:captures"...). Os quadros do ranking
-- por score/neg (geral e formatos) ficam nas temporadas antigas.
ALTER TABLE season_champions DROP CONSTRAINT season_champions_board_check;
ALTER TABLE season_champions ADD CONSTRAINT season_champions_board_check
  CHECK (board IN ('overall', '3x3', '4x4', '5x5', 'clans') OR board ~ '^stat:[a-zA-Z]+$');
