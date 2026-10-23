# OG-411 — 32 cores pessoais e as medalhas do top 3

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S43 |
| Status | Pronto |
| Dependências | OG-358 |
| Regras de negócio | RN-TIM-05, D-79 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero muito mais cores para o meu boneco, e o top 3 do mês com dourado, prateado e bronze, para me destacar.

## Contexto
- Pedido do PO em 2026-10-23 (S43): "um anseio muito antigo da comunidade" — personalização no jogo.
- Decisão do PO: paleta de 32 (as 16 de hoje + 16 novas bem distintas); cor livre (RGB) descartada para manter cada jogador reconhecível.

## Escopo
- 16 cores novas (grafite, gelo, rosa, coral, vinho, marrom, oliva, lima, menta, turquesa, petróleo, marinho, lavanda, roxo, mostarda, salmão; ajuste final na prancha), sem repetir no time (RN-TIM-05). Protocolo e favoritas aceitam 0..31.
- Dourado, prateado e bronze para o top 3 do "Melhor do mês" do mês anterior, durante o mês seguinte, com brilho metálico leve; fora da paleta comum.
- Sprites só das cores em uso na partida (montados sob demanda).
- Prancha com os bonecos nas 32 cores, nos dois times, sobre os fundos dos temas, para o PO aprovar antes.

## Critérios de aceite
- [ ] Prancha aprovada pelo PO.
- [ ] Escolha das 32 cores nas Opções e no perfil; medalha só para o top 3 do mês anterior (teste).

## Notas de implementação
