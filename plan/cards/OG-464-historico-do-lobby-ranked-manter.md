# OG-464 — Lobby Ranked guarda todo o histórico do chat

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S50 |
| Status | Concluído |
| Dependências | — |
| Issue | [#20](https://github.com/thiagovasconcellos/outgun-web/issues/20) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador no lobby Ranked, quero rolar o chat e ver as mensagens antigas, não só as últimas.

## Contexto
- Issue #20 (Lobby e salas; Médio; Sempre). 2.49.2, Chrome no Linux, jaru. Passos: mandar muitas mensagens no lobby Ranked; as antigas somem.
- Causa: o `RankedLobby` mostra `host.chat(8)` (`GameScreen.tsx:236`), ou seja, só as 8 últimas linhas do feed do HUD (`host.ts:814`). O `ChatLog` já rola, mas recebe só 8 linhas.

## Escopo
- O lobby Ranked mostra o histórico inteiro da sala (com um teto alto, ex. 200 linhas) e rola até o fim a cada mensagem nova.
- Não mexe no feed do HUD da partida (RN-UI-05).

## Critérios de aceite
- [x] Com mais de 8 mensagens, as antigas continuam no chat do lobby, que dá para rolar.
- [x] O chat da partida (HUD) não muda.
- [ ] PO confere.

## Notas de implementação
- O lobby pede 200 linhas ao feed (`host.chat(200)`), o mesmo teto que o `MessageFeed` já guarda; a caixa do chat já rolava (`max-height: 8rem`).
- A rolagem até o fim agora também acontece com o histórico cheio (o tamanho da lista para de mudar em 200).
