-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-492 (D-86, D-87): sala de treino. Modo e opções (`TrainingOptions` de @outgun/settings); nulo nas
-- outras salas.
ALTER TABLE rooms ADD COLUMN training jsonb;
