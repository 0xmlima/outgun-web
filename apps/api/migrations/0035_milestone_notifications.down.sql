-- SPDX-License-Identifier: GPL-2.0-or-later
DELETE FROM notifications WHERE kind = 'milestone';
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('clan_invite', 'clan_request'));
