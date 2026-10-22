-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-349 (D-65, RN-SKL): rating de habilidade OpenSkill (Plackett–Luce), um por conta, permanente e
-- único para todos os formatos. player_skill guarda o atual; skill_changes, a variação de cada
-- ranqueada (antes, depois e a chance de vitória prevista do time).
CREATE TABLE player_skill (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mu double precision NOT NULL,
  sigma double precision NOT NULL,
  matches integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skill_changes (
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team smallint NOT NULL,
  mu_before double precision NOT NULL,
  sigma_before double precision NOT NULL,
  mu_after double precision NOT NULL,
  sigma_after double precision NOT NULL,
  win_chance double precision NOT NULL,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX skill_changes_user_idx ON skill_changes (user_id);
