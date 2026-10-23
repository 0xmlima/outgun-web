# OG-408 — Identidade do clã na partida: quando o lado vira o clã (servidor)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S43 |
| Status | Pronto |
| Dependências | OG-407 |
| Regras de negócio | RN-CLA-09, D-78 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de clã, quero que o meu lado vire o clã na partida quando só tem gente do clã, para jogar "CLÃ x AZUL".

## Contexto
- Pedido do PO em 2026-10-23 (S43): "um anseio muito antigo da comunidade" — personalização no jogo.
- Decisão do PO (D-78): bots não contam; basta 2 humanos do mesmo clã num lado, sem humano de outro clã ou sem clã; vale a partir da próxima rodada.

## Escopo
- No início de cada rodada (mapa novo; no Ranked, cada jogo da série), o servidor olha os humanos de cada lado: ≥ 2 humanos, todos do mesmo clã → o lado é o clã (tag, nome, cor). A identidade fica fixa a rodada inteira; entradas e saídas no meio só contam na próxima.
- Cor: a primária; se ficar parecida com a cor do outro lado (o outro clã ou o vermelho/azul padrão), a secundária; se a secundária também, a cor padrão do lado. Clã x clã com a mesma primária: o lado azul (o segundo) usa a secundária.
- Mensagem nova do protocolo com a identidade de cada lado (no `welcome` para quem entra, e no replay); Casual e Ranked.

## Critérios de aceite
- [ ] Casual: 2 humanos do mesmo clã num lado (com bots) → o lado vira o clã na rodada seguinte; um humano de fora entrando no meio só desfaz na seguinte (teste).
- [ ] Clã x clã com a mesma primária: um usa a secundária; colisão nas duas: cor padrão (teste).

## Notas de implementação
