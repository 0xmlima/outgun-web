# OG-085 — Perfil e histórico de partidas

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S9 |
| Status | Backlog |
| Dependências | [OG-084](OG-084-ranking.md) |
| Regras de negócio | RN-STA-01, RN-STA-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver meu perfil, estatísticas acumuladas e histórico de partidas.

## Contexto e referências no original
- `save_stats` (HTML de estatísticas do servidor, `world.cpp:3752`) e `server_stats/stats.css`, `client_stats/stats.css`.

## Escopo
- Página de perfil pública (nick, clã, posição, estatísticas agregadas).
- Lista de partidas com placar e estatísticas detalhadas (equivalente ao HTML do original).
- Link para replay quando houver.

## Critérios de aceite
- [ ] Perfil e partida acessíveis por URL pública.
- [ ] Estatísticas batem com a tela F4 da partida.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
