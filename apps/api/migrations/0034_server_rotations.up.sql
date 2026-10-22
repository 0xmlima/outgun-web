-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-378: rotações padrão de cada game server (ROTATION/RANKED_ROTATION), do heartbeat; o painel
-- parte delas enquanto não há rotação salva.
ALTER TABLE game_servers ADD COLUMN rotations jsonb NOT NULL DEFAULT '{}'::jsonb;
