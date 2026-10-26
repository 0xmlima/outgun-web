-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-430/OG-431: issue do GitHub aberta a partir do relato e a situação dela vista pelo jogador
-- (aberta/fechada e a versão da correção, lida do milestone), com a hora da última consulta.
ALTER TABLE feedback
  ADD COLUMN github_issue integer,
  ADD COLUMN github_url text,
  ADD COLUMN issue_state text,
  ADD COLUMN fixed_in text,
  ADD COLUMN issue_checked_at timestamptz;
CREATE INDEX feedback_user_idx ON feedback (user_id, created_at DESC);
