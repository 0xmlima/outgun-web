-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-410 (D-79, RN-NUM-01): número do jogador, único de 2 a 99; o 1 é do líder do mês anterior, de uso
-- opcional (use_number_one). Avisos de número a expirar e liberado pelas notificações.
ALTER TABLE users
  ADD COLUMN player_number smallint CHECK (player_number BETWEEN 2 AND 99),
  ADD COLUMN number_changed_at timestamptz,
  ADD COLUMN number_warned_at timestamptz,
  ADD COLUMN use_number_one boolean NOT NULL DEFAULT false,
  -- OG-413: estilo do número (0 Bloco, 1 Corrida, 2 Contorno, 3 Estêncil)
  ADD COLUMN number_style smallint NOT NULL DEFAULT 0 CHECK (number_style BETWEEN 0 AND 3);
CREATE UNIQUE INDEX users_player_number_idx ON users (player_number) WHERE player_number IS NOT NULL;
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('clan_invite', 'clan_request', 'milestone', 'number_expiring', 'number_released'));
