# OG-392 — Marco fora da partida: Campeão da temporada (top 3 do hall da fama)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S41 |
| Status | Pronto |
| Dependências | OG-390, OG-268 |
| Regras de negócio | RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador que terminou uma temporada no pódio, quero um marco por isso, para o feito ficar no perfil para sempre.

## Contexto
- O hall da fama (OG-268, `season_champions`) guarda os 3 primeiros de cada quadro ao fechar a temporada. Não é feito de uma partida, por isso a RN-SOC-03 é estendida.

## Escopo
- `season_champion` Campeão da temporada / Season champion · top 3 de qualquer quadro de jogador numa temporada encerrada (`match_id` nulo, data = fechamento).
- Concedido no fechamento da temporada e no retroativo (`cli.js milestones`).

## Critérios de aceite
- [ ] Teste: fechar uma temporada concede o marco aos 3 primeiros e a ninguém mais; rodar de novo não duplica.

## Notas de implementação
