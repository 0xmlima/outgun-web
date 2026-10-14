-- SPDX-License-Identifier: GPL-2.0-or-later
DROP TABLE player_reports;
DROP TYPE report_status;
DELETE FROM bans WHERE user_id IS NULL AND ip IS NULL;
DROP INDEX bans_device_idx;
ALTER TABLE bans DROP CONSTRAINT bans_target_check;
ALTER TABLE bans ADD CONSTRAINT bans_check CHECK (user_id IS NOT NULL OR ip IS NOT NULL);
ALTER TABLE bans DROP COLUMN device_hash;
