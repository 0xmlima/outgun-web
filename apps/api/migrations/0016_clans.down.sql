-- SPDX-License-Identifier: GPL-2.0-or-later
DROP TABLE clan_members;
DROP TABLE clans;
DROP FUNCTION clan_members_sync_tag();
DROP FUNCTION clans_sync_tag();
ALTER TABLE users DROP CONSTRAINT users_clan_tag_check;
ALTER TABLE users ADD CONSTRAINT users_clan_tag_check CHECK (clan_tag IS NULL OR char_length(clan_tag) BETWEEN 1 AND 6);
