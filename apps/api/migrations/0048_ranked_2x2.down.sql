-- SPDX-License-Identifier: GPL-2.0-or-later
-- O PostgreSQL não remove valor de enum: '2x2' fica no tipo; salas, séries e partidas 2x2 perdem o formato.
DELETE FROM map_rotations WHERE key = 'ranked:2x2';
ALTER TABLE map_rotations DROP CONSTRAINT map_rotations_key_check;
ALTER TABLE map_rotations ADD CONSTRAINT map_rotations_key_check CHECK (key IN ('casual', 'ranked', 'ranked:3x3', 'ranked:4x4', 'ranked:5x5'));
UPDATE rooms SET format = NULL, best_of = NULL WHERE format = '2x2';
UPDATE matches SET format = NULL WHERE format = '2x2';
DELETE FROM ranked_series WHERE format = '2x2';
