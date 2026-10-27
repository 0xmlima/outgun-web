-- SPDX-License-Identifier: GPL-2.0-or-later
-- Hotfix 2.49.1: a tag do clã aceita até 3 caracteres (antes 1 a 2, OG-270).
ALTER TABLE clans DROP CONSTRAINT clans_tag_check;
ALTER TABLE clans ADD CONSTRAINT clans_tag_check CHECK (char_length(tag) BETWEEN 1 AND 3);
ALTER TABLE users DROP CONSTRAINT users_clan_tag_check;
ALTER TABLE users ADD CONSTRAINT users_clan_tag_check CHECK (clan_tag IS NULL OR char_length(clan_tag) BETWEEN 1 AND 3);
