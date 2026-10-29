-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-516/OG-517 (D-88, RN-RKL-01/04): formato 2x2 no Ranked e a rotação dele, semeada com os cinco
-- mapas pequenos (os mesmos do treino). O valor novo do enum não é usado nesta transação.
ALTER TYPE ranked_format ADD VALUE IF NOT EXISTS '2x2' BEFORE '3x3';

ALTER TABLE map_rotations DROP CONSTRAINT map_rotations_key_check;
ALTER TABLE map_rotations ADD CONSTRAINT map_rotations_key_check CHECK (key IN ('casual', 'ranked', 'ranked:2x2', 'ranked:3x3', 'ranked:4x4', 'ranked:5x5'));
INSERT INTO map_rotations (key, maps, version, updated_at)
  VALUES ('ranked:2x2', ARRAY['2 versus 2 (duel)', '3x3 (duel)', 'cebs park', 'pari2', 'the cover 4'], 1, now())
ON CONFLICT (key) DO NOTHING;
