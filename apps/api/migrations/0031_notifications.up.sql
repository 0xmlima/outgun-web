-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-361: notificações da conta (convite de clã para o convidado, pedido de entrada para a liderança
-- do clã), lidas ou não. O ícone no topo e os avisos (toast) leem daqui.
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('clan_invite', 'clan_request')),
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
