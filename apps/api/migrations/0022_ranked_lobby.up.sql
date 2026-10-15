-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-252 (RN-RKL-05..07, D-40/43/44): fase do lobby das salas Ranked com formato, informada pelo
-- game server no heartbeat, para a lista de salas e para recusar entrada com o jogo em andamento.
ALTER TABLE rooms ADD COLUMN phase text CHECK (phase IN ('lobby', 'vote', 'ready', 'countdown', 'game', 'finished'));
