-- SPDX-License-Identifier: GPL-2.0-or-later
-- Desfaz só o que ainda não foi usado: a temporada sem partidas nem pontos e as salas sem partidas.
DELETE FROM seasons s
WHERE s.name = 'Temporada 1'
  AND (SELECT count(*) FROM seasons) = 1
  AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.season_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.season_id = s.id);

DELETE FROM rooms r
WHERE r.id IN ('main', 'ranked')
  AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.room_id = r.id);
