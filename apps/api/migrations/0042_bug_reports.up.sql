-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-429: relato de bug do site com os campos do modelo de issue (área, resumo, passos, esperado,
-- obtido, frequência, gravidade, evidências e contorno).
ALTER TABLE feedback ADD COLUMN bug jsonb;
