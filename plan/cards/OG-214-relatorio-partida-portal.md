# OG-214 — Relatório de partida no portal

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S15 |
| Status | Backlog |
| Dependências | [OG-210](OG-210-portal-web.md) |
| Regras de negócio | RN-SOC-01, RN-SOC-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero abrir o relatório de uma partida num link compartilhável, com placar, times, números de cada jogador e o replay.

## Contexto
- Hoje: `MatchScreen` em `screens/stats.tsx` e `GET /matches/:id` (OG-085, `details` = `save_stats` do original).

## Escopo
- Placar e vencedor, mapa (prévia do `tools/map-preview`), duração, modo e regras.
- Tabela por time com kills, deaths, capturas, assistências, precisão, devoluções; destaque do melhor jogador.
- Linha do tempo das capturas (capturador, assistência, minuto).
- "Assistir replay" (abre o cliente no replay) e links para os perfis.
- Prévia Open Graph com o placar.

## Critérios de aceite
- [ ] Relatório de uma partida real do beta publicado e conferido com a F4.
- [ ] Prints desktop e celular.

## Notas técnicas
- No fim da partida o cliente oferece "Ver relatório" (OG-216).

## Notas de implementação
(preenchido durante a execução)
