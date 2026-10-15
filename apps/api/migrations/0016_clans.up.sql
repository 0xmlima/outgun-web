-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-270: clãs cadastrados (RN-CLA-01..05, D-47) substituem a clan tag livre. As tags livres são
-- apagadas; users.clan_tag passa a ser cópia da tag do clã atual, mantida pelos gatilhos abaixo
-- (ticket, chat, ranking e busca continuam lendo users.clan_tag).
CREATE TABLE clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 24),
  name_key text NOT NULL,
  tag text NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 2),
  tag_key text NOT NULL,
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clans_name_key_idx ON clans (name_key);
CREATE UNIQUE INDEX clans_tag_key_idx ON clans (tag_key);

CREATE TABLE clan_members (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES clans (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('leader', 'admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clan_members_clan_idx ON clan_members (clan_id, joined_at);
CREATE UNIQUE INDEX clan_members_leader_idx ON clan_members (clan_id) WHERE role = 'leader';

UPDATE users SET clan_tag = NULL WHERE clan_tag IS NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_clan_tag_check;
ALTER TABLE users ADD CONSTRAINT users_clan_tag_check CHECK (clan_tag IS NULL OR char_length(clan_tag) BETWEEN 1 AND 2);

CREATE FUNCTION clan_members_sync_tag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    UPDATE users SET clan_tag = NULL WHERE id = OLD.user_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE users SET clan_tag = (SELECT tag FROM clans WHERE id = NEW.clan_id) WHERE id = NEW.user_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER clan_members_sync_tag AFTER INSERT OR DELETE OR UPDATE OF user_id, clan_id ON clan_members
  FOR EACH ROW EXECUTE FUNCTION clan_members_sync_tag();

CREATE FUNCTION clans_sync_tag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET clan_tag = NEW.tag WHERE id IN (SELECT user_id FROM clan_members WHERE clan_id = NEW.id);
  RETURN NULL;
END $$;
CREATE TRIGGER clans_sync_tag AFTER UPDATE OF tag ON clans FOR EACH ROW EXECUTE FUNCTION clans_sync_tag();
