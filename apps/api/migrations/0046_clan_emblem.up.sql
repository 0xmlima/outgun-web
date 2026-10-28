-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-482 (D-85, RN-EMB-01/02): emblema do clã. Nulo = padrão (escudo + tag), sempre único porque a
-- tag é única; `emblem_key` (moldura, símbolo, filete e cores como aparecem) é única entre os clãs.
ALTER TABLE clans ADD COLUMN emblem jsonb, ADD COLUMN emblem_key text;
CREATE UNIQUE INDEX clans_emblem_key_idx ON clans (emblem_key);
