-- SPDX-License-Identifier: GPL-2.0-or-later
CREATE OR REPLACE FUNCTION clan_members_sync_tag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    UPDATE users SET clan_tag = NULL WHERE id = OLD.user_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE users SET clan_tag = (SELECT tag FROM clans WHERE id = NEW.clan_id) WHERE id = NEW.user_id;
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION clans_sync_tag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET clan_tag = NEW.tag WHERE id IN (SELECT user_id FROM clan_members WHERE clan_id = NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER clans_sync_tag ON clans;
CREATE TRIGGER clans_sync_tag AFTER UPDATE OF tag ON clans FOR EACH ROW EXECUTE FUNCTION clans_sync_tag();
DROP FUNCTION clan_label(text, text);
ALTER TABLE users DROP COLUMN clan_label;
ALTER TABLE clans DROP COLUMN tag_style;
