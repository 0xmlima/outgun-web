-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-263 (RN-RKL-20, D-46): desconexões permanentes no Ranked. A partida guarda quantos bots
-- substitutos entraram, quantas vagas ficaram vazias ("um a menos") e quando (time e segundos de
-- mapa). Continua contando para o ranking; as telas mostram a marca. Partidas antigas ficam com 0.
ALTER TABLE matches
  ADD COLUMN substitute_bots smallint NOT NULL DEFAULT 0,
  ADD COLUMN short_handed smallint NOT NULL DEFAULT 0,
  ADD COLUMN substitutions jsonb NOT NULL DEFAULT '[]';
