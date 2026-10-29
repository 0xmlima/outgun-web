-- SPDX-License-Identifier: GPL-2.0-or-later
DELETE FROM notifications WHERE kind = 'cup';
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('clan_invite', 'clan_request', 'milestone', 'number_expiring', 'number_released'));
ALTER TABLE player_profiles DROP COLUMN cup_emails;
ALTER TABLE rooms DROP COLUMN cup;
DROP TABLE cup_availability;
DROP TABLE cup_matches;
ALTER TABLE cups DROP CONSTRAINT cups_champion_fk, DROP CONSTRAINT cups_runner_up_fk;
DROP TABLE cup_duos;
DROP TABLE cup_entries;
DROP TABLE cups;
