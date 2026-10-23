# OG-414 — Cores e nome do clã no replay e no espectador

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-409 |
| Regras de negócio | RN-CLA-09, RN-UI-05, D-78 |
| Skills | `outgun-card-workflow` |

## História
Como espectador ou quem assiste a um replay, quero ver o lado do clã com as cores e a tag do clã, como na partida ao vivo.

## Contexto
- Pendência da S43 (PO, 2026-10-23): a partida ao vivo e o relatório usam as cores do clã (OG-409), mas o replay e o espectador (`apps/web/src/game/replay-host.ts`) ainda desenham vermelho x azul. Os números já aparecem nos dois.
- O `teamIdentity` já vai no replay (retrato inicial e mudanças) e chega à `ClientSession` do replay.

## Escopo
- No `replay-host`, a mesma cópia viva das cores do tema e o `applyTeamColours` do `host.ts` (texturas refeitas, minimapa e salas redesenhadas) e os nomes do placar/feed com a tag.

## Critérios de aceite
- [ ] Replay e espectador de uma partida DK x DT mostram as cores e as tags do clã (captura ao PO).

## Notas de implementação
