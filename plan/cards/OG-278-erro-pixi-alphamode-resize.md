# OG-278 — Erro do Pixi (`alphaMode`) ao redimensionar a janela na partida

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Correção |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S21 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero redimensionar a janela (ou entrar em tela cheia) no meio da partida sem erro, para o jogo não quebrar.

## Contexto
- Achado da S18 (OG-206): `Cannot read properties of null (reading 'alphaMode')` como erro de página ao trocar o tamanho da janela (1280×720 → 1920×1080) com o mapa visível. Não aparece no `visual:check` (mapa escondido), então deve vir do mundo ou das naves (`world-renderer.ts`, `room-source.ts`, `entity-renderer.ts`): provavelmente uma textura destruída ou ainda não pronta no `resize`.

## Escopo
- Reproduzir (partida online, redimensionar), achar a causa e corrigir.

## Critérios de aceite
- [ ] (PO) Partida online redimensionada várias vezes sem erro de página; o desenho continua certo.
- [ ] `pnpm visual:check` sem diferença (no fechamento).

## Notas de implementação
- Causa provável (pelo código, sem reproduzir): no `resize`, `WorldRenderer.invalidate` destruía as texturas das salas com os sprites ainda apontando para elas; se o Pixi desenhasse antes do próximo `render` do mundo (ou com o frame pulado), lia `source.alphaMode` de uma textura destruída. Agora os sprites soltam a textura (`Texture.EMPTY`) antes da destruição e ao ficarem sem sala.
