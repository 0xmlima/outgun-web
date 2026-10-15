-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-275: denúncia de clã pelo mesmo fluxo das denúncias do jogo (server_id 'web', alvo "(TAG) nome").
ALTER TABLE player_reports ADD COLUMN clan_id uuid REFERENCES clans (id) ON DELETE SET NULL;
CREATE INDEX player_reports_clan_idx ON player_reports (clan_id) WHERE clan_id IS NOT NULL;
