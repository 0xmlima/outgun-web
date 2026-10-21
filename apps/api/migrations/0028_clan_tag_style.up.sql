-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-338: o clã escolhe como a tag aparece junto do nome: (Dk) Felix, [Dk] Felix, Dk-Felix, Dk.Felix
-- ou Dk|Felix. users.clan_label guarda a tag já decorada (ticket, chat, HUD e listas do portal);
-- users.clan_tag continua a tag pura (links e busca). Os dois vêm dos gatilhos.
ALTER TABLE clans
  ADD COLUMN tag_style text NOT NULL DEFAULT 'paren' CHECK (tag_style IN ('paren', 'bracket', 'dash', 'dot', 'pipe'));
ALTER TABLE users ADD COLUMN clan_label text;

CREATE FUNCTION clan_label(tag text, style text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE style
    WHEN 'bracket' THEN '[' || tag || ']'
    WHEN 'dash' THEN tag || '-'
    WHEN 'dot' THEN tag || '.'
    WHEN 'pipe' THEN tag || '|'
    ELSE '(' || tag || ')'
  END
$$;

CREATE OR REPLACE FUNCTION clan_members_sync_tag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    UPDATE users SET clan_tag = NULL, clan_label = NULL WHERE id = OLD.user_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE users u SET clan_tag = c.tag, clan_label = clan_label(c.tag, c.tag_style) FROM clans c WHERE c.id = NEW.clan_id AND u.id = NEW.user_id;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION clans_sync_tag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET clan_tag = NEW.tag, clan_label = clan_label(NEW.tag, NEW.tag_style) WHERE id IN (SELECT user_id FROM clan_members WHERE clan_id = NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER clans_sync_tag ON clans;
CREATE TRIGGER clans_sync_tag AFTER UPDATE OF tag, tag_style ON clans FOR EACH ROW EXECUTE FUNCTION clans_sync_tag();

UPDATE users u SET clan_label = clan_label(c.tag, c.tag_style) FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.user_id = u.id;
