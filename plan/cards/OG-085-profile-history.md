# OG-085 — Perfil e histórico de partidas

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S9 |
| Status | Concluído |
| Dependências | [OG-084](OG-084-ranking.md) |
| Regras de negócio | RN-STA-01, RN-STA-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver meu perfil, estatísticas acumuladas e histórico de partidas.

## Contexto e referências no original
- `save_stats` (HTML de estatísticas do servidor, `world.cpp:3752`) e `server_stats/stats.css`, `client_stats/stats.css`.

## Escopo
- Página de perfil pública (nome, clã, posição no ranking, estatísticas agregadas **separadas por modo**: Ranked e Casual).
- Lista de partidas com placar e estatísticas detalhadas (equivalente ao HTML do original).
- Link para replay quando houver.

## Critérios de aceite
- [x] Perfil e partida acessíveis por URL pública.
- [x] Estatísticas batem com a tela F4 da partida. _(mesma fonte: o `PlayerStats` da sim — a F4 recebe o retrato do servidor (OG-066) e o perfil grava o `PlayerResult` do fim da partida)_

## Notas técnicas
- —

## Notas de implementação
- **Game server**: o resultado da partida ganha `details` (o conteúdo do `save_stats`): motivo, duração, título do mapa, regras ("Game info"), estatísticas dos times e capturas com capturador/assistente e placar-base (pontos de posse).
- **API**: migration `0006_match_details` (`matches.details`, índice por data). Rotas públicas `GET /players/:nome` (nome comparado como no login: sem maiúsculas/acentos; posição no ranking da temporada; totais **separados por modo** — partidas, vitórias/derrotas/empates, frags, mortes, capturas, assistências, bandeiras devolvidas, portadores mortos, precisão, tempo de jogo), `GET /players/:nome/matches?mode=&limit=&offset=` e `GET /matches/:id`. E-mail nunca aparece. `replayUrl` sempre `null` até os replays (OG-091).
- **Cliente**: páginas `/players/:nome`, `/matches/:id` e `/ranking` (tabelas no estilo do HTML de estatísticas, com as cores dos menus); "Ranking" no menu inicial e "Meu perfil" na conta. Textos novos em pt-BR.
- Achado: com `coerceTypes` do Fastify, uma união `string | null` com a string primeiro transforma `null` em `""`; no esquema do resultado o `null` vem primeiro.
- Prova: `apps/api/src/routes/players.test.ts`, `apps/web/src/screens/stats.test.ts`; E2E real (API + game server + cliente): sala privada, dono com `/set time_limit 1`, partida terminou por tempo em 59 s e apareceu no histórico; prints em `tools/parity/out/prints/085-{perfil,partida,ranking}.png`.
