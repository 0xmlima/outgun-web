-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-106: beta fechado. Convites (códigos gerados no painel) para cadastrar conta com BETA=1, e
-- feedback dos testadores (nota de fidelidade ao original 1–5, nota geral, texto e contexto) com
-- triagem no painel.
CREATE TABLE beta_invites (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{10}$'),
  note text NOT NULL DEFAULT '',
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 1000),
  uses integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CHECK (uses <= max_uses)
);
CREATE TABLE beta_invite_uses (
  code text NOT NULL REFERENCES beta_invites (code) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id)
);

CREATE TYPE feedback_kind AS ENUM ('bug', 'suggestion', 'praise', 'other');
CREATE TYPE feedback_status AS ENUM ('new', 'confirmed', 'critical', 'resolved', 'dismissed');
CREATE TABLE feedback (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  username text NOT NULL,
  kind feedback_kind NOT NULL,
  -- "a sensação de jogo é fiel ao Outgun original?" (critério do OG-105)
  fidelity smallint CHECK (fidelity BETWEEN 1 AND 5),
  overall smallint CHECK (overall BETWEEN 1 AND 5),
  -- jogou o Outgun original (veterano)
  veteran boolean NOT NULL DEFAULT false,
  text text NOT NULL DEFAULT '',
  context jsonb NOT NULL DEFAULT '{}',
  status feedback_status NOT NULL DEFAULT 'new',
  note text NOT NULL DEFAULT '',
  handled_by uuid REFERENCES users (id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_created_idx ON feedback (created_at DESC);
