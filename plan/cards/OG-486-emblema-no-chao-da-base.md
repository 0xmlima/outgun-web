# OG-486 — Emblema do clã no chão da base, na partida

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-485 |
| Regras de negócio | RN-EMB-04, RN-UI-05, D-78 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o emblema do clã pintado no chão da base do lado do clã, para a base ter a cara de quem está jogando.

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.
- P4: chão da base e fim de partida; **na bandeira não** (pode ficar confuso).

## Escopo
- Só quando o lado vira o clã (D-78). Emblema grande e apagado (decalque) no chão, sob o ponto da bandeira de cada base do lado, desenhado com as salas (`room-painter.ts`) por baixo de jogadores, itens e efeitos. Sai/entra na troca de identidade entre rodadas.
- Funcionar nos temas gráficos e nos estilos de HUD; nada muda de lugar (RN-UI-05).
- Replay e espectador: entram junto com as cores do clã no OG-414 (levar o OG-414 para a mesma sprint).

## Critérios de aceite
- [ ] Partida DK x DT com o emblema nas duas bases; lado sem clã sem emblema.
- [ ] `pnpm visual:check`, partida online real e capturas ao PO.

## Notas técnicas
- Textura do emblema rasterizada uma vez por identidade, no tamanho da tela (o SVG do OG-480); opacidade baixa para não competir com piso e paredes.

## Notas de implementação
