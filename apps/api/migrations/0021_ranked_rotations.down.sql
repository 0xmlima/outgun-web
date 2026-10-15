-- SPDX-License-Identifier: GPL-2.0-or-later
ALTER TABLE game_servers DROP COLUMN maps;
DELETE FROM map_rotations WHERE key LIKE 'ranked:%';
ALTER TABLE map_rotations DROP CONSTRAINT map_rotations_key_check;
ALTER TABLE map_rotations ALTER COLUMN key TYPE game_mode USING key::game_mode;
ALTER TABLE map_rotations RENAME COLUMN key TO mode;
