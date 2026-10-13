# OG-066 — Telas F1–F5, Tab e lista de mapas

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S9 |
| Status | Pronto |
| Dependências | [OG-065](OG-065-hud.md) |
| Regras de negócio | RN-STA-01, RN-STA-02, RN-VOT-01 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero ver ajuda, lista de mapas/votos, estatísticas do time e dos jogadores e info do servidor durante a partida.

## Contexto e referências no original
- F1 ajuda, F2 mapas, F3 time, F4 jogadores, F5 servidor, Tab pings (`doc/game.html`).
- `draw_scoreboard`, `team_statistics`, `draw_statistics`, `map_list` (`graphics.h:163-178`).

## Escopo
- Overlays com as mesmas informações; ordenação da lista de mapas; votar digitando número + Enter.

## Critérios de aceite
- [ ] Todas as telas implementadas e navegáveis por teclado.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
