-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-085: regras, estatísticas de time e capturas da partida (o "save_stats" do original).
ALTER TABLE matches ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
CREATE INDEX matches_ended_idx ON matches (ended_at DESC);
