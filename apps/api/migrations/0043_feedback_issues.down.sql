-- SPDX-License-Identifier: GPL-2.0-or-later
DROP INDEX feedback_user_idx;
ALTER TABLE feedback DROP COLUMN github_issue, DROP COLUMN github_url, DROP COLUMN issue_state, DROP COLUMN fixed_in, DROP COLUMN issue_checked_at;
