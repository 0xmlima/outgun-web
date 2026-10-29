-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-520..528 (D-88, RN-CUP): OutCup, a copa mensal 2x2. Uma edição por mês (`edition` = AAAA-MM),
-- inscrição individual, duplas sorteadas, chave mata-mata com os confrontos de cada fase, horários
-- disponíveis de cada jogador e a sala Ranked 2x2 do confronto (`rooms.cup`).
CREATE TABLE cups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition text NOT NULL UNIQUE CHECK (edition ~ '^\d{4}-\d{2}$'),
  status text NOT NULL DEFAULT 'registration' CHECK (status IN ('registration', 'running', 'finished', 'cancelled')),
  registration_opens_at timestamptz NOT NULL,
  draw_at timestamptz NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  rounds smallint,
  draw_seed text,
  champion_duo_id uuid,
  runner_up_duo_id uuid,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cup_entries (
  cup_id uuid NOT NULL REFERENCES cups (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  left_out boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cup_id, user_id)
);

CREATE TABLE cup_duos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cup_id uuid NOT NULL REFERENCES cups (id) ON DELETE CASCADE,
  player1_id uuid REFERENCES users (id) ON DELETE SET NULL,
  player2_id uuid REFERENCES users (id) ON DELETE SET NULL,
  player1_name text NOT NULL,
  player2_name text NOT NULL,
  seed smallint NOT NULL,
  rating integer NOT NULL DEFAULT 0
);
CREATE INDEX cup_duos_cup_idx ON cup_duos (cup_id);
ALTER TABLE cups
  ADD CONSTRAINT cups_champion_fk FOREIGN KEY (champion_duo_id) REFERENCES cup_duos (id) ON DELETE SET NULL,
  ADD CONSTRAINT cups_runner_up_fk FOREIGN KEY (runner_up_duo_id) REFERENCES cup_duos (id) ON DELETE SET NULL;

CREATE TABLE cup_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cup_id uuid NOT NULL REFERENCES cups (id) ON DELETE CASCADE,
  round smallint NOT NULL,
  slot smallint NOT NULL,
  duo_a uuid REFERENCES cup_duos (id) ON DELETE SET NULL,
  duo_b uuid REFERENCES cup_duos (id) ON DELETE SET NULL,
  best_of smallint NOT NULL CHECK (best_of IN (3, 5)),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'scheduled', 'live', 'done', 'walkover', 'double_walkover', 'bye', 'dispute')),
  proposed_at timestamptz,
  proposed_by uuid REFERENCES cup_duos (id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  room_id text REFERENCES rooms (id) ON DELETE SET NULL,
  series_id uuid REFERENCES ranked_series (id) ON DELETE SET NULL,
  winner_duo uuid REFERENCES cup_duos (id) ON DELETE SET NULL,
  score_a smallint,
  score_b smallint,
  resolution text CHECK (resolution IN ('series', 'tiebreak', 'walkover', 'double_walkover', 'bye', 'admin')),
  reminded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cup_id, round, slot)
);
CREATE INDEX cup_matches_room_idx ON cup_matches (room_id);

CREATE TABLE cup_availability (
  match_id uuid NOT NULL REFERENCES cup_matches (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  hours timestamptz[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

-- sala do confronto: o confronto e o lado de cada conta (as duas duplas)
ALTER TABLE rooms ADD COLUMN cup jsonb;
-- e-mails da OutCup (RN-CUP-12): ligados por padrão
ALTER TABLE player_profiles ADD COLUMN cup_emails boolean NOT NULL DEFAULT true;
-- avisos da OutCup no sino do portal (OG-527)
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('clan_invite', 'clan_request', 'milestone', 'number_expiring', 'number_released', 'cup'));
