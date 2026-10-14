-- SPDX-License-Identifier: GPL-2.0-or-later
-- OG-108: resumos anônimos da rede mandados pelos clientes (sem conta, nome nem IP); a região vem
-- da sala em que o jogador estava.
CREATE TABLE net_reports (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  room_id text,
  region text,
  version text NOT NULL,
  browser text NOT NULL,
  duration_s integer NOT NULL,
  ping_p50 integer,
  ping_p95 integer,
  lag_p50 integer NOT NULL,
  lag_p95 integer NOT NULL,
  fps_p5 integer NOT NULL,
  fps_p50 integer NOT NULL,
  corrections_per_min real NOT NULL,
  stall_seconds integer NOT NULL,
  frames_per_second real NOT NULL
);
CREATE INDEX net_reports_created_idx ON net_reports (created_at DESC);
