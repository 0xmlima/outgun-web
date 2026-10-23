-- SPDX-License-Identifier: GPL-2.0-or-later
-- Aviso de marco novo pelas notificações (OG-394).
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('clan_invite', 'clan_request', 'milestone'));
