-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-101: dados mínimos de produção, que antes só o seed de desenvolvimento criava. Sem uma
-- temporada ativa o ranking dá 404 e os deltas do Ranked não têm onde somar; sem as salas da
-- plataforma o "Jogar agora" não tem sala para abrir num banco novo.
INSERT INTO seasons (name, starts_at, active)
SELECT 'Temporada 1', now(), true
WHERE NOT EXISTS (SELECT 1 FROM seasons);

INSERT INTO rooms (id, name, mode, preset, max_players, persistent)
VALUES ('main', 'Principal', 'casual', 'classic', 16, true), ('ranked', 'Ranked', 'ranked', 'ranked', 16, true)
ON CONFLICT (id) DO NOTHING;
