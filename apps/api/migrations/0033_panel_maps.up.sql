-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-366 (D-70): mapas .txt enviados pela moderação, no formato do original; publicados na hora,
-- versionados e entregues aos game servers (OG-367). O texto fica em Latin-1 (como os arquivos do jogo).
CREATE TABLE panel_maps (
  name text PRIMARY KEY,
  text text NOT NULL,
  title text NOT NULL,
  author text NOT NULL DEFAULT '',
  width smallint NOT NULL,
  height smallint NOT NULL,
  crc integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE panel_map_versions (
  name text NOT NULL REFERENCES panel_maps(name) ON DELETE CASCADE,
  version integer NOT NULL,
  text text NOT NULL,
  crc integer NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (name, version)
);
