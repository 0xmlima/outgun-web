-- SPDX-License-Identifier: GPL-2.0-or-later
DELETE FROM rooms WHERE mode = 'ranked' AND password_hash IS NOT NULL;
ALTER TABLE rooms DROP CONSTRAINT rooms_password_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_check CHECK (mode = 'casual' OR password_hash IS NULL);
ALTER TABLE rooms DROP COLUMN phase;
