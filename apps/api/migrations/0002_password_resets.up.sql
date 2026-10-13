-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-081: links de recuperação de senha (RN-PLT-03): uso único, 30 min. Guarda só o hash do token.
CREATE TABLE password_resets (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);
