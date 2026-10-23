# OG-411 — 32 cores pessoais e as medalhas do top 3

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S43 |
| Status | Em revisão |
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
- [x] Prancha aprovada pelo PO.
- [x] Escolha das 32 cores nas Opções e no perfil; medalha só para o top 3 do mês anterior (teste).

## Notas de implementação
- Paleta em `packages/protocol/src/colors.ts` (0..31 comum, 32..34 ouro/prata/bronze; `colourKey`, `EXTRA_COLOUR_DEFAULTS` por baixo dos temas do original, que só definem `player01`..`16`). Prancha aprovada pelo PO em 2026-10-23 (`tools/visual-compare/colour-sheet.mjs`); 16 novas escolhidas pela maior diferença CIEDE2000.
- Medalha: `previousPodium` (quadro `stat:overall` da última temporada encerrada) vai no ticket (`medal`) e no perfil; o game server só aceita a medalha de quem tem direito; o sorteio fica nas 16 do original primeiro (mesma sequência do `rand`), as novas só se elas acabarem, medalha nunca.
- Cliente: sprites montados sob demanda (2 times × 35), brilho metálico na medalha (sprite e círculo); Opções mostram a medalha só para o pódio.
