# OG-448 — Convidar amigos da Steam na criação da sala personalizada

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-447 |
| Regras de negócio | RN-CFG-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador na Steam que cria uma sala personalizada, quero chamar meus amigos da Steam já na criação, para a sala encher com quem eu quero.

## Contexto
- `CreateRoomScreen` (`apps/web/src/screens/lobby.tsx`) cria a sala e navega direto para `/play?sala=<id>`. Não existe tela intermediária com o `roomId`.
- A tela da sala (`RoomScreen`, mesmo arquivo) já tem "Copy invite link".

## Escopo
- Na criação: opção "Convidar amigos da Steam ao entrar" (só com `steamAvailable()`). Marcada, ao entrar na sala o jogo abre a janela de convite (OG-447) com o token se a sala tiver senha.
- Na tela da sala: botão "Convidar pela Steam" ao lado de "Copy invite link", só na Steam.
- Textos em pt-BR, en e demais idiomas do i18n.

## Critérios de aceite
- [ ] A opção e o botão só aparecem no app aberto pela Steam.
- [ ] Com a opção marcada, a janela de convite abre logo depois de entrar na sala criada; desmarcada, nada abre.
- [ ] O botão da tela da sala abre a janela de convite para aquela sala.

## Notas de implementação
