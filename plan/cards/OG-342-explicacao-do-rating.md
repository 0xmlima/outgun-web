# OG-342 — Botão "i" com a explicação do rating

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S36 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | RN-RNK-02, RN-RNK-03, RN-RKL-13, RN-RKL-22, D-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero entender como o meu rating é calculado, para saber o que me faz subir ou cair.

## Contexto
- Pedido do PO (2026-10-21): explicação clara, transparente e direta, num botão "i" ao lado do rating. Um rating interno de habilidade para matchmaking fica para depois (OG-349).
- Cálculo atual: `apps/api/src/ranking.ts` (rating = (score+1)/(neg+1), mínimo de 100 de score); score/neg vêm dos frags da partida (`packages/sim/src/world/server.ts`, `scoreFrag`) com o modificador do time (RN-RNK-03).

## Escopo
- Botão "i" (design system v2) em todo lugar onde o rating aparece: ranking da temporada e geral, perfil e lobby Ranked. Abre um painel com:
  - a fórmula `rating = (score + 1) / (neg + 1)` e um exemplo com números;
  - o que soma score (matar, devolver bandeira, defender, capturar...) e o que soma neg (morrer pelo time, suicídio, fogo amigo...), em tabela com os pontos de cada evento, tirada do código;
  - o modificador do time (o time mais fraco ganha mais, entre 1/3 e 3x) explicado em uma frase com exemplo;
  - mínimo de 100 de score para aparecer, desempate por score, rating por formato e geral, temporadas mensais;
  - o que não conta: Casual, partidas canceladas (OG-345).
- Textos em pt-BR e inglês (`packages/i18n`).

## Critérios de aceite
- [ ] A tabela de eventos bate com o código (teste que compara a lista com as constantes, para não ficar desatualizada).
- [ ] "i" acessível por teclado e leitor de tela; fecha com Esc.
- [ ] PO lê e aprova o texto.

## Notas de implementação
