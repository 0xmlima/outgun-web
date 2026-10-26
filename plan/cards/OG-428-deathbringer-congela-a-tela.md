# OG-428 — Tela congela depois da explosão do Deathbringer

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S46 |
| Status | Concluído |
| Dependências | — |
| Issue | [#6](https://github.com/thiagovasconcellos/outgun-web/issues/6) |
| Regras de negócio | RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero continuar vendo a partida depois de ser atingido pela explosão do Deathbringer, para não ter de sair e entrar de novo na sala.

## Contexto
- Issue #6 (PO, 2.45.0, app da Steam, Casual): matou um portador do Deathbringer, foi atingido pela explosão e o jogo travou; só voltou saindo e entrando na sala. "Às vezes", gravidade crítica. Partida `04e58721-...` (6 Askelta, 2026-10-25).
- O replay da partida mostra o servidor normal: ozzylords foi atingido (frames 150885, 153255, 154906), ficou preso o tempo do efeito, morreu, renasceu e seguiu mandando comandos, sem queda nem ausência. O congelamento foi só na tela do cliente.
- O PixiJS 8 só pede o próximo quadro (`requestAnimationFrame`) depois de rodar os ouvintes do ticker: uma exceção no desenho de um quadro para o desenho para sempre, enquanto rede e teclado seguem. É o sintoma relatado.
- Estresse da física (scratch) achou ainda um laço infinito: jogador fora dos limites da sala com velocidade zero num eixo faz `changeRoomIfOutside` dividir por zero (`0 × ∞ = NaN`) e o laço de `applyPhysicsToRoom` nunca termina.

## Escopo
- O laço de desenho da partida sobrevive a um quadro com erro: registra o erro (console e serviço de erros, uma vez por mensagem) e segue no quadro seguinte.
- `changeRoomIfOutside` não divide por velocidade zero; os laços da física param se o tempo virar NaN.
- Teste da física para o caso do NaN.

## Critérios de aceite
- [x] Um erro lançado no desenho de um quadro não congela a tela (teste do laço).
- [x] Jogador fora da sala com velocidade zero troca de sala sem NaN e sem laço infinito (teste).
- [ ] PO confere numa partida com Deathbringer.

## Notas técnicas
- `apps/web/src/game/host.ts` (ticker da partida), `packages/sim/src/world/physics.ts` (`changeRoomIfOutside`, `applyPhysicsToPlayerInIsolation`, `applyPhysicsToRoom`).
- Mudança na simulação: registrar como D-81.

## Notas de implementação
- `guardFrame` (`game/frame-guard.ts`) envolve o quadro da partida no ticker: o quadro com erro se perde, o erro vai ao console e ao serviço de erros (`reportError`, uma vez por mensagem) e o desenho segue.
- A exceção exata do desenho não foi achada lendo o código (sem acesso aos logs do beta); com o Sentry ligado no build (`VITE_SENTRY_DSN`) ela aparece no próximo caso. Os estados reais do replay passados pela predição não deram NaN.
- Física: `changeRoomIfOutside` sem divisão por zero e laços que param com NaN (D-81), com teste.
