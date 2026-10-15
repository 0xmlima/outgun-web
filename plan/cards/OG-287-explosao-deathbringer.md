# OG-287 — Deathbringer sem explosão (anel e som) para os jogadores

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Correção |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S22 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | RN-PUP-01..09 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver a onda de choque e ouvir a explosão quando um portador de deathbringer morre, para saber de onde vem o dano e fugir dele.

## Contexto
- Achado do PO no beta (2026-10-15): "o shadow não tem animação de explosão" — no jogo, o único power-up com explosão é o deathbringer.
- O servidor da v2 cria a explosão e aplica o dano (`killPlayer`, `packages/sim/src/world/server.ts:244`), mas **nunca envia** o evento `deathbringer` (protocolo 61, `packages/protocol/src/messages.ts:610`). No original, `killPlayer` chama `sendDeathbringer` para todos e grava no replay (`src/world.cpp:2263-2266`, `src/servnet.cpp:3232-3241`).
- O cliente já trata o evento: anel (`session.ts:491`, `entity-renderer.ts:467`) e som `usedeathbringer` (`apps/web/src/game/audio/sound-events.ts:74`).

## Escopo
- `ServerHooks`: novo gancho `deathbringerExploded(pid, team, pos, frame)` chamado em `killPlayer`.
- `room.ts`: `broadcast` de `deathbringer` (time, frame, sala e posição) e gravação no replay.
- Teste do game server: matar um portador de deathbringer gera o evento para todos os clientes.

## Critérios de aceite
- [ ] Teste do evento no game server.
- [ ] (PO) Morte de quem tem deathbringer: anel crescendo, som da explosão, também no replay e no espectador.

## Notas de implementação
