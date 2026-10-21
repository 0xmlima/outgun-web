# OG-346 — Jogadores demoram a aparecer ao entrar na sala

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S36 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver todo mundo assim que entro na sala.

## Contexto
- Relato do PO (2026-10-21): ao entrar na sala (no mapa), os outros jogadores levam alguns instantes para aparecer. Acontece no Casual e no Ranked; não é a lista do lobby.

## Escopo
- Medir o tempo entre entrar no mapa e ver os outros (bonecos e placar) e achar a causa: dados dos outros só no próximo ciclo de envio, espera do buffer de interpolação, ou nomes/lista vindo depois do primeiro frame.
- Mandar o estado completo dos jogadores junto da entrada, para que apareçam já no primeiro frame.

## Critérios de aceite
- [x] Teste: o primeiro frame depois da entrada já traz os jogadores presentes.
- [ ] PO confere.

## Notas de implementação
- Causa encontrada no servidor: o minimapa manda 2 jogadores por frame em rodízio (4 depois que o cliente informa a banda); com o time inteiro espalhado, os últimos apareciam vários frames depois. Agora o primeiro frame do jogo de cada destinatário (entrada, troca de mapa, volta da pausa ou do placar) leva todos de uma vez; depois volta o rodízio.
- Quem está na mesma sala já vinha no primeiro frame. Se o PO ainda notar demora nos bonecos da sala, o próximo suspeito é o carregamento do mapa no cliente.
