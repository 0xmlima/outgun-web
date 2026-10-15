-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-251 (RN-RKL-04): rotação Ranked por formato. A chave deixa de ser o modo e passa a ser
-- casual | ranked | ranked:3x3 | ranked:4x4 | ranked:5x5; a rotação Ranked atual vira a inicial
-- dos três formatos. Os game servers informam os mapas que têm, para o painel validar a rotação.
ALTER TABLE map_rotations RENAME COLUMN mode TO key;
ALTER TABLE map_rotations ALTER COLUMN key TYPE text USING key::text;
ALTER TABLE map_rotations ADD CONSTRAINT map_rotations_key_check CHECK (key IN ('casual', 'ranked', 'ranked:3x3', 'ranked:4x4', 'ranked:5x5'));
INSERT INTO map_rotations (key, maps, version, updated_by, updated_at)
  SELECT f.key, r.maps, 1, r.updated_by, r.updated_at
  FROM map_rotations r CROSS JOIN (VALUES ('ranked:3x3'), ('ranked:4x4'), ('ranked:5x5')) AS f (key)
  WHERE r.key = 'ranked'
ON CONFLICT (key) DO NOTHING;

ALTER TABLE game_servers ADD COLUMN maps text[] NOT NULL DEFAULT '{}';
