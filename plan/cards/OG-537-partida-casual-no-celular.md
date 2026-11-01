# OG-537 — Partida Casual no celular e no tablet com controles de toque (experimental)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Funcionalidade |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | — (fora de sprint, v2.57.1) |
| Status | Concluído |
| Dependências | OG-417 |
| Regras de negócio | RN-UI-01, RN-UI-08 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no celular ou no tablet, quero entrar numa partida Casual com controles de toque, para jogar sem precisar de um computador.

## Contexto
- Contribuição da comunidade: PR #27 (Marco Lima, `0xmlima`), mesclado com squash em 2026-11-01 (bfe2a42) sobre a v2.57.0, com as travas de 3963e2d.
- Revê a D-80 (antes: partida só no computador).

## Escopo
- "Jogar agora (experimental)" na tela inicial do celular; a rota `/play` liberada no celular.
- HUD em pé (modo `celular` de `screen-layout.ts`): sala em cima, barra, minimapa e placar lado a lado; o placar desliza entre time vermelho, azul e chat (HTML, com campo de mensagem).
- Controles de toque (`TouchControls.tsx`): direcional de 8 direções, andar sozinho, Shift e Alt fixos, tiro e tiro automático; F8, menu e F2 nos cantos da sala; tocar num mapa da lista F2 vota nele.
- Travas: toque e HUD do celular só em sala Casual; no celular, sala Ranked ou da OutCup leva ao aviso "só no computador"; a página da OutCup no celular não mostra "Entrar na sala"; controles escondidos no lobby Ranked e no fim da partida.
- `vite.phone.config.ts` e `DEVELOPMENT.md`: testar no aparelho pelo ngrok.

## Critérios de aceite
- [x] No celular, "Jogar agora (experimental)" entra numa sala Casual e os controles de toque movem, atiram e votam.
- [x] Computador sem mudança no HUD nem na lista F2.
- [x] Ranked e OutCup não abrem a partida no celular.
- [x] lint, typecheck, build e testes passam.
