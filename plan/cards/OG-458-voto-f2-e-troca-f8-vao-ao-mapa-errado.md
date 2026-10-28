# OG-458 — Voto no mapa (F2) com pedido de troca (F8) não vai para o mapa votado

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S50 |
| Status | Concluído |
| Dependências | — |
| Issue | [#11](https://github.com/thiagovasconcellos/outgun-web/issues/11) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que, ao votar num mapa com F2 e pedir a troca com F8, a sala vá para o mapa que votei.

## Contexto
- Issue #11 (Partida / HUD; médio; sempre). 2.49.1, Chrome no Windows, apelido Réplica, sala só com bots.
- Obtido: a troca acontece, mas recarrega o mesmo mapa que estava sendo jogado.
- O servidor parece certo à primeira vista: `mapVote` guarda o índice da rotação (`room.ts:1095`) e `nextMap` (`map-vote.ts`) escolhe o mais votado. Suspeitas: índice da lista ordenada da F2 (`sortMaps` em `info-screens.ts:171`) mandado no lugar do índice da rotação; voto zerado antes da saída (`host.ts:808`, `online-hud.ts:138`); ou F8 antes de o voto chegar.

## Escopo
- Reproduzir num teste (sala com 1 humano e bots: vota no mapa N com a lista ordenada por outra coluna, pede a troca) e corrigir a causa.

## Critérios de aceite
- [x] F2 + F8 numa sala só com bots troca para o mapa votado, com a lista da F2 em qualquer ordenação (teste).
- [ ] PO confere.

## Notas de implementação
- O cliente estava certo: a F2 mostra e manda o índice da rotação em qualquer ordenação (`sortMaps` devolve índices da rotação). O caminho voto + saída também (teste com 1 humano e bots).
- Causa provável: `Room.setRotation` comparava as entradas pelo arquivo. Com `random_map`, o arquivo gerado muda a cada vez, então o painel reaplicando a config marcava uma "rotação nova", e a troca seguinte zerava os votos e ia para o mapa 0. Isso também acontecia quando a rotação mudava de verdade. Agora `random_map` se compara pelos parâmetros, e numa troca por voto o mapa mais votado continua valendo se estiver na rotação nova.
- Não deu para provar nos logs do beta (leitura de produção barrada). Se o PO ainda vir o bug, o próximo passo é registrar no log a troca por voto (votos, mapa escolhido, rotação pendente).
