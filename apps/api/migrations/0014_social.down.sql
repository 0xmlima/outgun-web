-- SPDX-License-Identifier: GPL-2.0-or-later
DROP INDEX matches_room_ended_idx;
DROP INDEX users_clan_idx;
DROP INDEX users_username_key_prefix_idx;
DROP TABLE rating_points;
DROP TABLE player_daily;
DROP TABLE player_pairs;
ALTER TABLE player_profiles DROP COLUMN hide_history;
ALTER TABLE player_profiles DROP COLUMN hide_companions;
