# OG-458 — Voto no mapa (F2) com pedido de troca (F8) não vai para o mapa votado

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S50 |
| Status | Pronto |
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
- [ ] F2 + F8 numa sala só com bots troca para o mapa votado, com a lista da F2 em qualquer ordenação (teste).
- [ ] PO confere.

## Notas de implementação
(preenchido durante a execução)
