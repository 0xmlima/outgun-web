# OG-090 — Gravação de replays

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Concluído |
| Dependências | [OG-042](OG-042-snapshots-aoi.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero que partidas sejam gravadas para rever e compartilhar.

## Contexto e referências no original
- `record_message`, `pid_record` (`servnet.cpp`), `REPLAY_VERSION` (`protocol.h`), setting `recording`.

## Escopo
- Gravar o stream de um "espectador onisciente" (snapshots + eventos) comprimido.
- Upload para object storage ao fim da partida; metadados na API.
- Retenção configurável.

## Critérios de aceite
- [x] Replay de 10 min com 16 jogadores ≤ 5 MB.
- [x] Versão do formato gravada no cabeçalho.

## Notas técnicas
- —

## Notas de implementação
- Spec: [replays.md](../specs/replays.md); divergências em D-28.
- `packages/protocol/src/replay.ts` (formato `OGWR` v1, puro) e mensagem `replayFrame` (31); `PROTOCOL_VERSION` 2 → 3, MESSAGES.md regenerado.
- `apps/game-server/src/replay.ts`: `ReplayRecorder` (bloco inicial + um bloco por frame, gzip nível 9) e `ReplayStore` (disco, URL pública, retenção). `Room` grava a cada início de partida e fecha no relatório (agora depois de `endOfGameMessages`, para o placar entrar no replay); rota `GET /replays/:file` no servidor; env `REPLAYS`, `REPLAY_DIR`, `REPLAY_PUBLIC_URL`, `REPLAY_RETENTION_DAYS`.
- API: migration 0007 (`matches.replay_url`), `replayUrl` opcional em `/internal/matches`, devolvido em `GET /matches/:id`; openapi.json regenerado.
- Critério de tamanho: 10 min com 16 jogadores andando e atirando = 1,5 MB (`replay.test.ts`).
- Upload para object storage fica para o OG-103 (infra); a interface `save(key, data) → url` já isola o destino.
