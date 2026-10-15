-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-267 (RN-RKL-22, D-48): temporadas mensais. `month` (AAAA-MM, horário de Brasília) é única: a
-- virada é idempotente. Temporadas antigas ficam sem mês; a ativa recebe o mês corrente na primeira
-- verificação. `season_standings` guarda a classificação final de cada temporada encerrada.
ALTER TABLE seasons ADD COLUMN month text CHECK (month ~ '^[0-9]{4}-[0-9]{2}$');
CREATE UNIQUE INDEX seasons_month_idx ON seasons (month);

CREATE TABLE season_standings (
  season_id integer NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  position integer NOT NULL,
  score double precision NOT NULL,
  neg integer NOT NULL,
  matches integer NOT NULL,
  PRIMARY KEY (season_id, user_id)
);
CREATE INDEX season_standings_position_idx ON season_standings (season_id, position);
