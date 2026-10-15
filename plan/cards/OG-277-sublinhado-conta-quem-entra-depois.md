# OG-277 — Quem entra depois não vê o sublinhado de conta dos que já estavam

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Correção |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S21 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador que entra numa partida em andamento, quero ver quem tem conta (nome sublinhado no placar) como quem já estava, para a informação ser a mesma para todos.

## Contexto
- Achado da S18 (OG-206): o `playerInfo` (conta, ranking, cor) só é transmitido na entrada de cada jogador (`apps/game-server/src/room.ts`, `if (identity.rating) this.broadcast(this.playerInfo(...))`); o estado inicial de quem chega (`welcomeMessages`) não traz o dos outros. Na captura, o Rival (entrou depois) não via o sublinhado de `(TG) NomeCom...`.

## Escopo
- Incluir o `playerInfo` de cada jogador já presente em `welcomeMessages` (também vale para espectador e replay).

## Critérios de aceite
- [ ] (PO) Quem entra depois vê o sublinhado de conta de todos, igual a quem já estava.
- [ ] `pnpm visual:check` sem diferença (no fechamento; a mudança é só de rede).

## Notas de implementação
- `welcomeMessages` inclui o `playerInfo` de cada jogador com rating; como o replay e o espectador começam pelo mesmo `welcomeMessages(-1)`, eles também recebem. Teste em `room.test.ts`.
