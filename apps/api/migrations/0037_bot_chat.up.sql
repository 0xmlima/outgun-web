-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-404: chat dos bots (ligado, teto por minuto e, por acontecimento, chance, quem fala e
-- mensagens). Vazio = as mensagens padrão do jogo (`DEFAULT_BOT_CHAT`).
ALTER TABLE bot_settings ADD COLUMN chat jsonb NOT NULL DEFAULT '{}'::jsonb;
