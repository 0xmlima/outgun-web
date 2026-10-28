-- SPDX-License-Identifier: GPL-2.0-or-later
DROP INDEX clans_emblem_key_idx;
ALTER TABLE clans DROP COLUMN emblem, DROP COLUMN emblem_key;
