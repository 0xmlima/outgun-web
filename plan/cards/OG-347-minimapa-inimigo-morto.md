# OG-347 — Inimigo morto reaparece no minimapa onde morreu

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S36 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o minimapa mostre só inimigos vivos, sem fantasmas.

## Contexto
- Relato do PO (2026-10-21): quando um inimigo morre, o ponto dele some do minimapa e volta no lugar da morte até ele renascer.
- Suspeita: a posição de minimapa (`minimap_send_limit`) do morto continua sendo enviada/guardada com a última posição, e o cliente redesenha depois de apagar na morte.

## Escopo
- Morto não aparece no minimapa até renascer (servidor não envia, cliente ignora a posição velha).

## Critérios de aceite
- [x] Teste no servidor e no cliente: morto fora do minimapa até o respawn.
- [ ] RN-UI-05: `pnpm visual:check`; PO confere numa partida online.

## Notas de implementação
- Causa: o servidor já não mandava mortos no minimapa; o evento `spawn` desmarcava o morto no cliente, que ainda tinha a posição da morte vista há menos de 2 s (o fade do minimapa é de 20 frames) e redesenhava ali. Agora o `spawn` esquece a posição até chegar a nova. Teste só no cliente (o servidor não mudou).
