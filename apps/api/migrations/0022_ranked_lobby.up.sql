-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-252 (RN-RKL-05..07, D-40/43/44): fase do lobby das salas Ranked com formato, informada pelo
-- game server no heartbeat, para a lista de salas e para recusar entrada com o jogo em andamento.
ALTER TABLE rooms ADD COLUMN phase text CHECK (phase IN ('lobby', 'vote', 'ready', 'countdown', 'game', 'finished'));
-- D-44: sala de lobby Ranked pode ter senha (as regras continuam travadas); a Ranked sem formato não.
ALTER TABLE rooms DROP CONSTRAINT rooms_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_password_check CHECK (mode = 'casual' OR password_hash IS NULL OR format IS NOT NULL);
