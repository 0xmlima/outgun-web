-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-409: o clã que cada lado foi na partida ([vermelho, azul], tag, nome e cor); nulo = vermelho x azul.
ALTER TABLE matches ADD COLUMN team_identity jsonb;
