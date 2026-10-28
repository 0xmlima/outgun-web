# OG-477 — Radar dos dois times no lobby Ranked antes de começar

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S53 |
| Status | Em andamento |
| Dependências | OG-469, OG-470 |
| Regras de negócio | RN-RAD-01, RN-RAD-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do Ranked, quero ver o estilo dos dois times antes de começar, para saber se o balanceamento ficou parecido também no jeito de jogar.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- No lobby Ranked (`RankedLobby.tsx`), com os lados montados: radar com a mediana de cada time (vermelho x azul) e o arquétipo de cada jogador ao lado do nome.
- Atualiza quando alguém troca de lado ou entra; jogador sem radar não entra na mediana.
- Nada dentro da partida: o placar e o HUD não mudam (RN-UI-05).

## Critérios de aceite
- [ ] Lobby com time incompleto e com jogadores sem radar não quebra.

## Notas de implementação
