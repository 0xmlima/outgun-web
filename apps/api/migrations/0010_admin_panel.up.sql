-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-087: painel admin. Moderador (salas, denúncias, bans de sala, auditoria) além do admin;
-- jogadores de cada sala no heartbeat; comandos do painel entregues aos game servers na resposta
-- do heartbeat; presets Casual criados no painel (com histórico) e rotações de mapas por modo.
ALTER TABLE users ADD COLUMN is_moderator boolean NOT NULL DEFAULT false;

ALTER TABLE rooms ADD COLUMN roster jsonb NOT NULL DEFAULT '[]';

CREATE TYPE admin_command_kind AS ENUM ('kick', 'ban', 'mute', 'unmute', 'message');
CREATE TABLE admin_commands (
  id bigserial PRIMARY KEY,
  server_id text NOT NULL,
  room_id text NOT NULL,
  kind admin_command_kind NOT NULL,
  -- uid do jogador na sala (/list), minutos do ban, motivo, texto da mensagem
  args jsonb NOT NULL DEFAULT '{}',
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  -- ban de plataforma (admin) além do ban da sala
  platform boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  done_at timestamptz,
  result jsonb
);
CREATE INDEX admin_commands_pending_idx ON admin_commands (server_id, id) WHERE delivered_at IS NULL;

CREATE TABLE casual_presets (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  description text NOT NULL,
  overrides text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE casual_preset_versions (
  preset_id text NOT NULL REFERENCES casual_presets (id) ON DELETE CASCADE,
  version integer NOT NULL,
  description text NOT NULL,
  overrides text NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  changed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (preset_id, version)
);

CREATE TABLE map_rotations (
  mode game_mode PRIMARY KEY,
  maps text[] NOT NULL CHECK (cardinality(maps) BETWEEN 1 AND 64),
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
