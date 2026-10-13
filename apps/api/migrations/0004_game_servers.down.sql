-- SPDX-License-Identifier: GPL-2.0-or-later
DROP INDEX rooms_server_idx;
ALTER TABLE rooms DROP COLUMN maps;
DROP TABLE game_servers;
