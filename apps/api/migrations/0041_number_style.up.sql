-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-413: estilo do número do jogador (0 Bloco, 1 Corrida, 2 Contorno, 3 Estêncil).
ALTER TABLE users ADD COLUMN number_style smallint NOT NULL DEFAULT 0 CHECK (number_style BETWEEN 0 AND 3);
