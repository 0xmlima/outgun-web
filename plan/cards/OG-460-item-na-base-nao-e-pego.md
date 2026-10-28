# OG-460 — Item na base que aparece na tela, mas não é pego

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S50 |
| Status | Concluído |
| Dependências | — |
| Issue | [#15](https://github.com/thiagovasconcellos/outgun-web/issues/15) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero pegar o item que vejo na tela (ou não vê-lo, se outro já pegou).

## Contexto
- Issue #15 (Partida / HUD; médio; aconteceu uma vez). 2.49.1, desktop/Steam no Linux, jaru. Passava por cima de um turbo na base logo ao entrar e nada; suspeita do jogador: um bot já tinha pegado e a tela não atualizou.
- Sem partida certa (o link da issue é de 23/10). Se foi logo depois de entrar, pode ser o estado inicial dos itens no `join`/troca de mapa (o snapshot dos powerups chega antes ou depois do `clientReady`?) ou o mesmo atraso da tela preta corrigida na 2.49.2 (frames `skipped`).

## Escopo
- Conferir como o cliente recebe os itens ao entrar na sala e ao trocar de mapa, e quando some o item pego por outro; teste que entra com itens já pegos.
- Se não reproduzir, registrar nas notas e deixar log no cliente (Sentry) para a próxima vez.

## Critérios de aceite
- [x] Ao entrar numa sala em andamento, item já pego não aparece (teste).
- [ ] PO confere.

## Notas de implementação
- Causa: o `powerupPicked` só ia para quem estava na mesma tela, e ao entrar numa tela o servidor só mandava os itens que estavam lá, sem apagar os velhos. Um item pego por um bot enquanto o jogador estava em outra tela ficava no cliente como fantasma.
- Correção no servidor (`room.ts`): cada cliente guarda os power-ups que conhece (`knownItems`); ao mudar de tela, os que não estão mais no chão daquela tela recebem `powerupPicked`. A lista é zerada na troca de mapa e no `worldReset`. Protocolo e cliente sem mudança.
