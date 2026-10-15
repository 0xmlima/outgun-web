# OG-206 — Clã do jogador no HUD da partida, em todos os modos

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S18 |
| Status | Em revisão |
| Dependências | [OG-265](OG-265-protecao-visual-hud.md), [OG-270](OG-270-clas-cadastro-api.md) |
| Regras de negócio | RN-NOM-04, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o clã de cada jogador dentro da partida, para saber com quem e contra quem estou jogando.

## Contexto
- A tag passa a ser a do clã cadastrado (OG-270, até 2 caracteres). Hoje ela só aparece no chat, como `(TAG) nome` (`chatName`, `packages/protocol/src/names.ts`); o servidor a conhece (`identity.clanTag`, vinda do ticket), mas ela não chega ao HUD.

## Escopo
- Levar a clan tag de cada jogador ao cliente (mensagem de informação dos jogadores em `packages/protocol`).
- Mostrar `(TAG) nome` onde o nome do jogador aparece hoje no HUD: placar (Tab), nome sobre o jogador, mensagens de abate/captura e espectador/replay ao vivo. Casual, Ranked e espectador.
- Bot substituto (OG-262) mostra a tag do jogador que ele substitui; convidados e bots comuns não têm tag.

## Critérios de aceite
- [x] `pnpm visual:check` (OG-265): fora dos textos de nome, diferença zero; colunas, posições e tamanhos do HUD não mudam.
- [x] Caso extremo conferido sem sobrepor nada: tag de 2 + nome de 15 caracteres (e `BOT-` + 15) em todas as resoluções.
- [x] Conferido numa **partida online de verdade**, com capturas para o PO antes de ir para revisão.

## Notas técnicas
- Mesma fonte e tamanho atuais (bitmap); se o texto mais longo não couber numa coluna, cortar com reticências — nunca alargar a coluna.
- Replays antigos (sem tag) continuam funcionando.

## Notas de implementação
- Mensagem nova `playerClan` (125, s2c) logo depois do `playerJoined` e no estado inicial (`welcomeMessages`, que também alimenta espectador e replay); replays antigos simplesmente não a têm. A sessão monta `names` como `(TAG) nome` (`chatName`), então placar, nome sobre a nave, mensagens, F3/F4, espectador e lobby mostram a tag sem mudança em cada tela.
- Placar: nome com mais de 15 caracteres vira 12 + "..." (`scoreboardName`); a coluna não muda. `visual:check` sem clã: 16/16 iguais. Conferido online com conta real, clã "TG" e nome de 15 caracteres (1280×720 e 1920×1080); capturas entregues ao PO.
- Achados fora do escopo: quem entra depois não recebe o `playerInfo` (sublinhado de conta) dos que já estavam; erro do Pixi `alphaMode` ao redimensionar com o mapa visível.
