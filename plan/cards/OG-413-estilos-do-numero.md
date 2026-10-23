# OG-413 — Estilos do número do jogador

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S43 |
| Status | Em andamento |
| Dependências | OG-410 |
| Regras de negócio | RN-NUM-01, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero escolher o estilo do meu número, como as placas da F1, e que ele seja legível sobre qualquer cor.

## Contexto
- Pedido do PO em 2026-10-23 (captura das placas da F1 de 2026): com a fonte do HUD, o número some em cores claras. Escolhida a opção de 4 estilos prontos (fonte livre descartada).
- As fontes da F1 são proprietárias; os estilos usam fontes OFL parecidas, empacotadas no site (`@fontsource`).

## Escopo
- 4 estilos: **Bloco** (Russo One), **Corrida** (Saira Condensed 900 inclinada), **Contorno** (Chakra Petch, só o traço) e **Estêncil** (Saira Stencil One).
- Contraste automático em todos: número escuro sobre cor pessoal clara, branco sobre escura, com contorno da cor oposta.
- Desenho do número em textura guardada por (estilo, número, cor); some com o boneco pequeno, como hoje.
- Escolha na Conta, junto do número, com prévia; o estilo vai no ticket e na mensagem `playerNumber`.
- Prancha com os 4 estilos sobre as 32 cores, nos dois times, para o PO aprovar antes.

## Critérios de aceite
- [ ] Prancha aprovada pelo PO.
- [ ] Jogador escolhe o estilo e todos na partida o veem (teste do protocolo).
- [ ] Número legível nas 32 cores (prancha) e capturas da partida ao PO (RN-UI-05).

## Notas de implementação
