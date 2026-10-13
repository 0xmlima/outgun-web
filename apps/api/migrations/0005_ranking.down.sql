-- SPDX-License-Identifier: GPL-2.0-or-later
DROP INDEX ratings_leaderboard_idx;
DROP TABLE rating_deltas;
ALTER TABLE player_profiles DROP COLUMN ranking_participation;
