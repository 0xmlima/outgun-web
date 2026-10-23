-- SPDX-License-Identifier: GPL-2.0-or-later
DELETE FROM notifications WHERE kind IN ('number_expiring', 'number_released');
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('clan_invite', 'clan_request', 'milestone'));
DROP INDEX users_player_number_idx;
ALTER TABLE users DROP COLUMN player_number, DROP COLUMN number_changed_at, DROP COLUMN number_warned_at, DROP COLUMN use_number_one;
