-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-289 (D-51): bots escolhidos pelo dono ao criar a sala privada Casual. Quantidade fixa e nível
-- (1–5; 0 = variável). Nulos = a sala segue o preset.
ALTER TABLE rooms
  ADD COLUMN bots smallint,
  ADD COLUMN bot_level smallint;
