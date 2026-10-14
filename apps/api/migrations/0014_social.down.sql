-- SPDX-License-Identifier: GPL-2.0-or-later
DROP INDEX matches_room_ended_idx;
DROP INDEX users_clan_idx;
DROP INDEX users_username_key_prefix_idx;
DROP INDEX rating_deltas_user_idx;
DROP INDEX match_players_user_match_idx;
ALTER TABLE player_profiles DROP COLUMN hide_history;
ALTER TABLE player_profiles DROP COLUMN hide_companions;
