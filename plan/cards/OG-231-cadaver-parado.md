# OG-231 — Corpo do jogador eliminado continua se movendo

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Correção |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S21 |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o corpo de quem morreu fique parado onde caiu, para a tela não mostrar um "cadáver" deslizando como se a física continuasse.

## Contexto
- Achado do PO no beta (2026-10-15): às vezes, depois da eliminação, o corpo segue em movimento. Esperado: morto, nenhum movimento até o respawn.
- No servidor e na extrapolação do cliente a física já pula mortos (`shouldApplyPhysicsToPlayer`: `packages/sim/src/world/server.ts:1452`, `packages/netcode/src/session.ts:258`), mas `killPlayer` (`server.ts:~273`) não zera a velocidade. Suspeitos, nessa ordem:
  1. suavização das correções da extrapolação (`session.ts:595-680`) arrastando o corpo da posição prevista até a do servidor;
  2. frames do servidor que ainda trazem posição/velocidade do jogador morto (morte no meio do frame, quique/empurrão no mesmo frame da morte);
  3. o corpo desenhado (`entity-renderer.ts:124`, `drawDead`) usando a posição interpolada em vez da posição da morte.

## Escopo
- Reproduzir numa partida online (com latência, ex. `tools/dev` com atraso) e achar a causa.
- O corpo fica fixo na posição da morte até o respawn, no cliente de quem morreu, nos outros clientes, no espectador e no replay.
- Se mexer em `packages/sim` (ex. zerar a velocidade na morte): registrar decisão D-NN e atualizar os testes afetados.

## Critérios de aceite
- [ ] Morte com o jogador em alta velocidade (correndo, empurrado, quicando): o corpo não se move depois da morte, nos três pontos de vista (próprio, adversário, espectador).
- [ ] Teste automatizado cobrindo o caso (sim ou netcode, conforme a causa).
- [ ] `pnpm visual:check` sem diferença.

## Notas de implementação
(preenchido durante a execução)
