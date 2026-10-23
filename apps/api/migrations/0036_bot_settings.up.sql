-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-403: cadastros da aba Bots da moderação (uma linha só): prefixos e nomes possíveis, cada um
-- com { text, active }. Começa com o prefixo BOT- (pedido do PO) e sem nomes (vale o gerador).
CREATE TABLE bot_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  prefixes jsonb NOT NULL DEFAULT '[]'::jsonb,
  names jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO bot_settings (prefixes) VALUES ('[{"text":"BOT-","active":true}]'::jsonb);
