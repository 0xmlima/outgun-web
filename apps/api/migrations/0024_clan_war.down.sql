-- SPDX-License-Identifier: GPL-2.0-or-later
ALTER TABLE matches DROP COLUMN clan_war, DROP COLUMN red_clan_id, DROP COLUMN blue_clan_id;
ALTER TABLE match_players DROP COLUMN clan_id;
