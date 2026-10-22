-- SPDX-License-Identifier: GPL-2.0-or-later
DELETE FROM season_champions WHERE board LIKE 'stat:%';
ALTER TABLE season_champions DROP CONSTRAINT season_champions_board_check;
ALTER TABLE season_champions ADD CONSTRAINT season_champions_board_check CHECK (board IN ('overall', '3x3', '4x4', '5x5', 'clans'));
