-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-104: ban por dispositivo (RN-PLT-05) e denúncias de jogadores (/report) para a moderação.
-- device_hash é o SHA-256 (32 hex) de um id aleatório do navegador; o id cru nunca chega aqui.
ALTER TABLE bans ADD COLUMN device_hash text CHECK (device_hash ~ '^[0-9a-f]{32}$');
ALTER TABLE bans DROP CONSTRAINT bans_check;
ALTER TABLE bans ADD CONSTRAINT bans_target_check CHECK (user_id IS NOT NULL OR ip IS NOT NULL OR device_hash IS NOT NULL);
CREATE INDEX bans_device_idx ON bans (device_hash) WHERE device_hash IS NOT NULL;

CREATE TYPE report_status AS ENUM ('open', 'dismissed', 'actioned');
CREATE TABLE player_reports (
  id bigserial PRIMARY KEY,
  room_id text REFERENCES rooms (id) ON DELETE SET NULL,
  server_id text NOT NULL,
  map text,
  reporter_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  reporter_name text NOT NULL,
  target_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  target_name text NOT NULL,
  target_ip inet,
  target_device_hash text CHECK (target_device_hash ~ '^[0-9a-f]{32}$'),
  reason text NOT NULL,
  status report_status NOT NULL DEFAULT 'open',
  handled_by uuid REFERENCES users (id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX player_reports_open_idx ON player_reports (created_at DESC) WHERE status = 'open';
CREATE INDEX player_reports_target_idx ON player_reports (target_user_id);
