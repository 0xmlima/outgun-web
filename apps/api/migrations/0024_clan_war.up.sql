-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-259 (RN-RKL-14): clã x clã. Cada jogador guarda o clã cadastrado que tinha ao fim da partida
-- (vale o da época, mesmo que saia depois; OG-273); a partida guarda a marcação e os dois clãs. A
-- marcação fica mesmo que um dos clãs seja apagado. Partidas antigas ficam sem clã.
ALTER TABLE match_players ADD COLUMN clan_id uuid REFERENCES clans (id) ON DELETE SET NULL;
CREATE INDEX match_players_clan_idx ON match_players (clan_id) WHERE clan_id IS NOT NULL;

ALTER TABLE matches
  ADD COLUMN clan_war boolean NOT NULL DEFAULT false,
  ADD COLUMN red_clan_id uuid REFERENCES clans (id) ON DELETE SET NULL,
  ADD COLUMN blue_clan_id uuid REFERENCES clans (id) ON DELETE SET NULL;
CREATE INDEX matches_clan_war_idx ON matches (red_clan_id, blue_clan_id) WHERE clan_war;
