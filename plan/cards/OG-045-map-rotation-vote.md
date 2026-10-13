# OG-045 — Rotação e votação de mapas

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S7 |
| Status | Em revisão |
| Dependências | [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-VOT-01, RN-VOT-02, RN-VOT-03, RN-VOT-04, RN-VOT-05 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero votar no próximo mapa e para encerrar o atual.

## Contexto e referências no original
- `Server::check_map_exit` (`server.cpp:775`).
- `Server::server_next_map` (`server.cpp:565`).
- Votos negativos (`data_negative_map_votes`).

## Escopo
- Votos por mapa, voto de saída, votos negativos, bloqueio por tempo, escolha do próximo mapa, rotação aleatória.

## Critérios de aceite
- [x] Testes cobrindo empate por tempo desde último jogo, sem votos e com votos negativos.
- [x] Bots não contam na votação.

## Notas técnicas
- Bots (IA) são do OG-048 (S10): para o critério 2 basta um jogador marcado como bot na sala, sem IA.

## Notas de implementação
- Spec: [plan/specs/votacao-mapas.md](../specs/votacao-mapas.md). Sem divergências do original.
- **Regras puras** em `apps/game-server/src/map-vote.ts` (próximo mapa, saída por voto, anúncio, ordem da rotação) com 12 testes; integração no `Room` com 3 testes (lista na entrada, troca para o mapa votado com bot que não conta, anúncio e votos negativos).
- **Servidor**: rotação conforme `random_maprot`, `mapVote`/`mapExit`/`negativeMapVotes`, `mapList`/`mapVotes`/`currentMap`, anúncio `mapChangeInfo` a cada 5 s no máximo, troca por voto com placar (`mapChange` com motivo `vote`), saída de jogador também verifica a troca.
- **Cliente**: F8 liga/desliga o voto ("EXIT MAP" piscando; cinza quando o servidor avisa que o voto não vale sem mapa específico), mensagens de votos e "Este é o mapa X (n de N)", placar no fim por capturas e por voto, "Aguardando o início do jogo - Próximo mapa" junto do placar.
- Fica para outros cards: escolher um mapa específico na lista (F2, OG-066); `/forcemap` (OG-046); download de mapa que o cliente não tem (os mapas do servidor e do cliente vêm do mesmo repositório).
- Roteiro no navegador: `tools/visual-compare/vote.mjs` (dois votos trocam o mapa); prints `og045-*.png`.
