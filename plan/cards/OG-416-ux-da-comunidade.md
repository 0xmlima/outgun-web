# OG-416 — Melhorias de UX da comunidade (PR #5)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S44 |
| Status | Em revisão |
| Dependências | OG-200 |
| Regras de negócio | RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma tela inicial e menus com mais cara de jogo, para entrar na partida com o time que escolhi e achar as opções sem esforço.

## Contexto
- Contribuição de 0xmlima (PR #5, `ux-melhorias`, 6 commits), mesclada na `v2` em 2026-10-25 a pedido do PO.

## Escopo
- Nova tela inicial (`home-start.tsx`, `home-logo.png`) com escolha de time; no Casual, se o servidor puser no outro lado, o cliente pede a troca ao entrar.
- Estilo retrô nos menus (`ui/retro.css`) e botão da trilha na barra de cima (`MusicButton.tsx`).
- Escolhas longas abrem a lista inteira ao clicar no valor (`Field.tsx`).
- App desktop: `openExternal` abre o site no navegador do sistema (só a página do jogo pede, só http(s)).
- Nome de quem entrou leva ao perfil.

## Critérios de aceite
- [x] `pnpm verify` verde no head da PR (o teste de tick com 32 conexões só passou rodando em série; ele oscila com a máquina carregada).
- [ ] PO confere a tela inicial, os menus e a escolha de time no Casual.

## Notas de implementação
- Nada do HUD mudou de lugar; a escolha de time só manda o `changeTeam` ao conectar (`game/host.ts`).
- `openExternal` só existe nos apps desktop a partir da 2.44.0; nos anteriores o link do site na tela inicial não aparece.
