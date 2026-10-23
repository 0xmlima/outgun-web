-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-407: cores primária e secundária do clã (paleta CLAN_COLORS); nulas = sem cores (o lado do
-- clã fica com a cor padrão).
ALTER TABLE clans ADD COLUMN primary_color text, ADD COLUMN secondary_color text;
