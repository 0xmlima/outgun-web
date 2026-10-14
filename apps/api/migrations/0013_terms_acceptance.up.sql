-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-107: versão dos termos de uso e da política de privacidade aceitos no cadastro.
ALTER TABLE users ADD COLUMN terms_version text;
ALTER TABLE users ADD COLUMN terms_accepted_at timestamptz;
