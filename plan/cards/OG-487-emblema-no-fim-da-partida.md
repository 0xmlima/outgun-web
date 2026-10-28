# OG-487 — Emblema do clã no fim de rodada e de partida

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S51 |
| Status | Concluído |
| Dependências | OG-485 |
| Regras de negócio | RN-EMB-04, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o emblema do clã vencedor na tela de fim, junto do "VENCEU".

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.

## Escopo
- Fim de rodada e de partida (e pausa, se couber sem mover nada): emblema do lado vencedor acima do "TAG VENCEU"; empate mostra os dois.
- RN-UI-05: elemento novo numa área declarada, sem mexer no resto.

## Critérios de aceite
- [ ] `pnpm visual:check`, partida online real e capturas ao PO.

## Notas de implementação
- No modal de fim de partida (`match-end.tsx`, que também fecha cada mapa do Casual): emblema de 72 px do lado vencedor acima do placar; empate mostra os dois; lado sem clã ou sem emblema, nada. Linha nova no topo do modal, sem mexer no resto (o HUD da partida não muda).
- `visual:check`, partida real e capturas no fechamento.
