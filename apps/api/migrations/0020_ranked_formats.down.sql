-- SPDX-License-Identifier: GPL-2.0-or-later
ALTER TABLE matches DROP COLUMN game_no, DROP COLUMN series_id, DROP COLUMN format;
DROP TABLE ranked_series;
ALTER TABLE rooms DROP CONSTRAINT rooms_format_series_check, DROP COLUMN best_of, DROP COLUMN format;
DROP TYPE ranked_format;
