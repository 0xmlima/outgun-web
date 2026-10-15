-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-271: convites (o clã chama o jogador) e pedidos (o jogador pede ao clã), que expiram em 7 dias
-- (RN-CLA-04), e a carência de 7 dias para entrar em outro clã depois de sair ou ser expulso (D-47).
CREATE TABLE clan_requests (
  clan_id uuid NOT NULL REFERENCES clans (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invite', 'request')),
  invited_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (clan_id, user_id)
);
CREATE INDEX clan_requests_user_idx ON clan_requests (user_id);
CREATE UNIQUE INDEX clan_requests_one_request_idx ON clan_requests (user_id) WHERE kind = 'request';

ALTER TABLE users ADD COLUMN clan_cooldown_until timestamptz;
