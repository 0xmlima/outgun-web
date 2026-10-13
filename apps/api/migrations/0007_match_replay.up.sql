-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-090: endereço do replay gravado pelo game server.
ALTER TABLE matches ADD COLUMN replay_url text;
