-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-362: eventos de cada ranqueada (abates e ações de bandeira, em ordem), para os stats que
-- dependem do momento (OG-363) e o "quem matou quem" (OG-364). Os eventos citam jogadores pelo
-- índice em match_event_players, que tem a conta (o nome vira "(anon)" ao excluir a conta).
CREATE TABLE match_events (
  match_id uuid PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  events jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE match_event_players (
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  idx smallint NOT NULL,
  slot smallint NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  team smallint NOT NULL,
  is_bot boolean NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, idx)
);
CREATE INDEX match_event_players_user_idx ON match_event_players (user_id);
