# OG-413 — Estilos do número do jogador

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S43 |
| Status | Em revisão |
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
- [x] Prancha aprovada pelo PO.
- [x] Jogador escolhe o estilo e todos na partida o veem (teste do protocolo).
- [x] Número legível nas 32 cores (prancha) e capturas da partida ao PO (RN-UI-05).

## Notas de implementação
- Prancha aprovada pelo PO em 2026-10-23 ("número vazando um pouco do boneco fica incrível"). `apps/web/src/game/render/number-styles.ts` (estilos, contraste automático, `paintNumber`) usado na partida (textura por estilo/número/contraste) e na prévia da Conta; fontes OFL em `ui/tokens.css` (`@fontsource`, créditos no CREDITS.md).
- `number_style` na migração 0040 (ainda não aplicada no beta), `PUT /account/number-style`, `numberStyle` no ticket e `style` na `playerNumber` (132).
- Achado nas capturas: a troca de time (Ctrl+End) não levava número, estilo nem a marcação de bot (OG-403) para a vaga nova no cliente; corrigido em `ClientSession.onTeamChange` com teste.
- `hud-check` e `clan-shots` apontam o `/api` do preview para uma porta vazia: com uma API local na 7800, o cliente não caía no ticket de desenvolvimento.
