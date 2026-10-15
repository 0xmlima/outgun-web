-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-213: marcos conquistados (catálogo em src/milestones.ts). Uma linha por conta e marco, com a
-- data e a partida da conquista; o preenchimento retroativo é `cli.js milestones`.
CREATE TABLE player_milestones (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  milestone text NOT NULL,
  achieved_at timestamptz NOT NULL,
  match_id uuid REFERENCES matches (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, milestone)
);
CREATE INDEX player_milestones_match_idx ON player_milestones (match_id);
