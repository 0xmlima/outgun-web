# OG-447 — Convite pela Steam: overlay, lobby da Steam e entrada pelo convite

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-328, OG-396, OG-400 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador que abriu o Outgun pela Steam, quero convidar um amigo da minha lista da Steam para a sala em que estou, para ele entrar direto sem eu ter que mandar link.

## Contexto
- O app desktop já usa `steamworks.js` 0.4.0 só para as conquistas (`apps/desktop/main.js:202`, OG-396). O SDK liga tarde, depois que a janela desenha (OG-400), e o overlay da Steam está desligado. Sem overlay, a janela de convite da Steam não aparece.
- Toda sala já tem link (`/rooms/<id>`, "Copy invite link" em `apps/web/src/screens/lobby.tsx`; `inviteUrl` em `apps/api/src/routes/rooms.ts`).
- A 0.4.0 tem `matchmaking.createLobby` + `Lobby.openInviteDialog()`/`overlay.activateInviteDialog` e o callback `GameLobbyJoinRequested`. Ela não tem `ActivateGameOverlayInviteDialogConnectString` nem `GameRichPresenceJoinRequested`, por isso o lobby da Steam serve só de envelope do `roomId`.
- Este card é a base; os botões ficam em OG-448 (criar sala), OG-449 (menu da partida) e OG-450 (lobby Ranked).

## Escopo
- **Overlay:** `electronEnableSteamOverlay()` só quando a Steam abriu o jogo (`launchedBySteam`). Medir antes o efeito no FPS livre (OG-373/OG-400) no Windows; se travar o FPS, o card para e volta ao PO (fallback abaixo).
- **Convidar:** IPC `outgun:steam-invite` (preload: `steamInvite(roomId, token?)`). O main cria (ou reaproveita) um lobby da Steam `FriendsOnly` com `room` (e `token`, se houver) nos dados e abre a janela de convite. Um lobby por sala; sair da sala sai do lobby.
- **Aceitar com o jogo aberto:** `GameLobbyJoinRequested` → `joinLobby` → lê `room`/`token` → manda à página (`outgun:steam-join`), que navega para `/rooms/<id>` (sala com senha: entra com o token).
- **Aceitar com o jogo fechado:** a Steam abre o app com `+connect_lobby <id>`; o `main.js` lê o `argv` e faz o mesmo depois que a página carrega. Com isso o SDK precisa ligar na abertura quando houver `+connect_lobby`, sem quebrar a regra do OG-400 (nada da Steam antes de o jogo desenhar).
- **Sala com senha:** a senha não vai nos dados do lobby. A API emite um token curto de convite por sala (rota nova, expira em ~10 min) que dispensa a senha.
- Fora da Steam (navegador, `.exe` avulso) nada aparece: `steamAvailable()` decide.

## Critérios de aceite
- [ ] Com o app aberto pela Steam, `steamInvite` abre a janela de convite da Steam por cima do jogo (Windows; macOS e Linux conferidos, problemas viram card).
- [ ] O amigo que aceita com o jogo aberto cai na tela da sala certa; com o jogo fechado, a Steam abre o Outgun e ele cai na mesma tela.
- [ ] Convite de sala com senha entra sem pedir a senha; o token vencido mostra o pedido de senha normal.
- [ ] FPS livre e input iguais aos de antes com o overlay ligado e com o overlay aberto (medido uma vez, Windows).
- [ ] Fora da Steam nada muda (sem SDK, sem overlay, sem IPC novo respondendo).

## Notas técnicas
- **Fallback se o overlay travar o FPS:** sem overlay não existe janela de convite. As opções são uma lista própria de amigos via koffi na API flat (`ISteamFriends`) ou ficar só com o link. Decisão do PO.
- O overlay do Electron no macOS é historicamente instável; aceitável sair só no Windows/Linux se o PO concordar.

## Notas de implementação
