-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-082: nomes antigos ficam reservados para o dono depois de uma troca (spec plan/specs/names.md).
CREATE TABLE reserved_names (
  name_key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reserved_until timestamptz NOT NULL
);
CREATE INDEX reserved_names_user_idx ON reserved_names (user_id);
