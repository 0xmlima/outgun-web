-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-080: modelo inicial da plataforma (contas, sessões, perfis, temporadas, salas, partidas,
-- ranking, bans e auditoria). Desfeito por 0001_initial.down.sql.

CREATE TYPE game_mode AS ENUM ('casual', 'ranked');

-- Contas (RN-PLT-01). username_key e email_key são as formas normalizadas usadas na unicidade
-- (RN-NOM-02); o e-mail só serve para recuperar a senha e nunca é exibido.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL CHECK (char_length(username) BETWEEN 1 AND 15),
  username_key text NOT NULL,
  email text NOT NULL,
  email_key text NOT NULL,
  password_hash text NOT NULL,
  clan_tag text CHECK (clan_tag IS NULL OR char_length(clan_tag) BETWEEN 1 AND 6),
  is_admin boolean NOT NULL DEFAULT false,
  username_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_key_idx ON users (username_key);
CREATE UNIQUE INDEX users_email_key_idx ON users (email_key);

-- Sessões de navegador (cookie httpOnly). Guarda só o hash do token.
CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip inet,
  user_agent text
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Preferências do jogador que acompanham a conta (idioma, cores favoritas, opções do cliente).
CREATE TABLE player_profiles (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'pt',
  favorite_colors smallint[] NOT NULL DEFAULT '{}',
  settings jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Temporadas do ranking (RN-RNK web). No máximo uma ativa.
CREATE TABLE seasons (
  id serial PRIMARY KEY,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT false,
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX seasons_single_active_idx ON seasons (active) WHERE active;

-- Salas (substituem o master server). server_id/ws_url/last_heartbeat_at vêm do heartbeat do
-- game server; password_hash só em salas privadas Casual (RN-CFG-03).
CREATE TABLE rooms (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  name text NOT NULL,
  mode game_mode NOT NULL,
  preset text NOT NULL,
  password_hash text,
  owner_id uuid REFERENCES users (id) ON DELETE SET NULL,
  max_players smallint NOT NULL CHECK (max_players BETWEEN 2 AND 32),
  persistent boolean NOT NULL DEFAULT false,
  server_id text,
  ws_url text,
  players smallint NOT NULL DEFAULT 0,
  map text,
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mode = 'casual' OR password_hash IS NULL)
);

-- Partidas encerradas, enviadas pelo game server (POST /internal/matches).
CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text REFERENCES rooms (id) ON DELETE SET NULL,
  season_id integer REFERENCES seasons (id) ON DELETE SET NULL,
  server_id text NOT NULL,
  server_match_id text NOT NULL,
  mode game_mode NOT NULL,
  ranked boolean NOT NULL,
  map text NOT NULL,
  red_score smallint NOT NULL,
  blue_score smallint NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at >= started_at),
  CHECK (mode = 'ranked' OR NOT ranked)
);
-- Reenvio do mesmo resultado (rede instável) não duplica a partida.
CREATE UNIQUE INDEX matches_server_match_idx ON matches (server_id, server_match_id);
CREATE INDEX matches_ended_at_idx ON matches (ended_at DESC);

-- Participação de cada jogador (RN-STA-01). user_id fica nulo para convidados e para contas
-- excluídas (RN-PLT-04: a partida fica anonimizada). stats guarda o conjunto completo.
CREATE TABLE match_players (
  match_id uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 0 AND 31),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  name text NOT NULL,
  team smallint NOT NULL CHECK (team IN (0, 1)),
  is_bot boolean NOT NULL DEFAULT false,
  frags integer NOT NULL DEFAULT 0,
  kills integer NOT NULL DEFAULT 0,
  deaths integer NOT NULL DEFAULT 0,
  captures integer NOT NULL DEFAULT 0,
  play_seconds integer NOT NULL DEFAULT 0,
  score_delta double precision NOT NULL DEFAULT 0,
  neg_delta integer NOT NULL DEFAULT 0,
  stats jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (match_id, slot)
);
CREATE INDEX match_players_user_idx ON match_players (user_id);

-- Ranking por temporada (RN-RNK-02/03, D-02): rating = (score+1)/(neg+1).
CREATE TABLE ratings (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  season_id integer NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
  score double precision NOT NULL DEFAULT 0,
  neg integer NOT NULL DEFAULT 0,
  matches integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_id)
);

-- Bans de plataforma (room_id nulo) e de sala (RN-PLT-05). Alvo por conta, por IP ou ambos.
CREATE TABLE bans (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  ip inet,
  room_id text REFERENCES rooms (id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CHECK (user_id IS NOT NULL OR ip IS NOT NULL),
  CHECK (room_id IS NULL OR (expires_at IS NOT NULL AND expires_at <= created_at + interval '7 days'))
);
CREATE INDEX bans_user_idx ON bans (user_id);
CREATE INDEX bans_ip_idx ON bans (ip);

-- Auditoria de moderação (RN-CHT-04): autor, alvo, motivo e duração. Os nomes ficam copiados
-- para o registro sobreviver à exclusão das contas.
CREATE TABLE admin_actions (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  target_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  target_name text,
  room_id text REFERENCES rooms (id) ON DELETE SET NULL,
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_actions_created_idx ON admin_actions (created_at DESC);
