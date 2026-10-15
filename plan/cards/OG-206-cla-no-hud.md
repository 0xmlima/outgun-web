# OG-206 — Clã do jogador no HUD da partida, em todos os modos

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S17 |
| Status | Backlog |
| Dependências | [OG-265](OG-265-protecao-visual-hud.md) |
| Regras de negócio | RN-NOM-05, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o clã de cada jogador dentro da partida, para saber com quem e contra quem estou jogando.

## Contexto
- Hoje a clan tag só aparece no chat, como `(TAG) nome` (`chatName`, `packages/protocol/src/names.ts`); o servidor a conhece (`identity.clanTag`, vinda do ticket), mas ela não chega ao HUD.

## Escopo
- Levar a clan tag de cada jogador ao cliente (mensagem de informação dos jogadores em `packages/protocol`).
- Mostrar `(TAG) nome` onde o nome do jogador aparece hoje no HUD: placar (Tab), nome sobre o jogador, mensagens de abate/captura e espectador/replay ao vivo. Casual, Ranked e espectador.
- Bot substituto (OG-262) mostra a tag do jogador que ele substitui; convidados e bots comuns não têm tag.

## Critérios de aceite
- [ ] `pnpm visual:check` (OG-265): fora dos textos de nome, diferença zero; colunas, posições e tamanhos do HUD não mudam.
- [ ] Caso extremo conferido sem sobrepor nada: tag de 6 + nome de 15 caracteres (e `BOT-` + 15) em todas as resoluções.
- [ ] Conferido numa **partida online de verdade**, com capturas para o PO antes de ir para revisão.

## Notas técnicas
- Mesma fonte e tamanho atuais (bitmap); se o texto mais longo não couber numa coluna, cortar com reticências — nunca alargar a coluna.
- Replays antigos (sem tag) continuam funcionando.

## Notas de implementação
(preenchido durante a execução)
