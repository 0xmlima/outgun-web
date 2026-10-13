# OG-051 — Bots: navegação até destinos

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Em revisão |
| Dependências | [OG-050](OG-050-bot-areamap.md) |
| Regras de negócio | RN-BOT-02 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como bot, quero andar até uma área de destino passando pelas portas, para chegar a bandeiras, bases e power-ups.

## Contexto e referências no original
- `src/robot.cpp:655-796` (`FreeDir`, `MoveDir*`, `FreeWalk`, `MoveIndirectlyTowards`, `MoveTo*`; `rand()` da direita p/ esquerda em 750).
- `src/robot.cpp:1033-1159` (`setDestination`, `MoveToDestination`, `nearestDoor`, `MoveToDoor`).

## Escopo
- Movimento produzindo `ClientControls` (mesma interface de input de um humano).
- Sem escolha de destino (OG-053) nem combate (OG-052).

## Critérios de aceite
- [x] Cenário de paridade: bot com destino fixo gera a mesma sequência de controles do original por ≥ 600 frames em `outgun1`.
- [x] Bot chega ao destino em todos os pares de áreas de 3 mapas (teste de propriedade, sem ficar preso).

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
- Spec: [plan/specs/bots-ia.md](../specs/bots-ia.md) (cobre OG-051 a OG-053).
- `packages/bots`: `view.ts` (`BotView`/`BotPlayer`: o `ClientWorld` do bot sobre os tipos da sim, com `posUpdated`, minimapa, `enemies_seen_frame` e as **bases do mapa do cliente**, que perdem as bandeiras removidas pelo servidor), `robot-core.ts` (estado do `Robot`, áreas, `IsBehindWall`, `WallHitPosition`, `nearestDoor`, extrapolação com `applyPlayerAcceleration`/`applyPhysicsToPlayerInIsolation` da sim), `situation.ts` (`Teams`, explosões, bases — com time 2 = bases selvagens, que é o que o `tinfo[2]` fora do vetor lê no original), `navigation.ts` (`FreeDir`, `MoveDir*`, `FreeWalk` com o y sorteado antes do x, `MoveIndirectlyTowards`, `MoveTo*`, `setDestination`, `MoveToDestination`, `MoveToDoor`).
- **Harness da IA** (serve aos três cards): `tools/parity/patches/002-bottrace.patch` grava, com a diretiva `bottrace`, cada decisão de cada bot (visão do cliente, estado do bot, controles pendentes, `rand()` da thread dos bots e resultado) em `traces/NOME.bots.jsonl.gz`. Cenários `bots-ai-outgun1`, `-verde`, `-freeturn`, `-ksii`, `-deathbringer` (≈ 22.700 decisões); os traces da sim desses jogos também entram na paridade da sim (resync, 152 testes verdes).
- Critério 1: os controles dependem do laço inteiro do bot (combate e escolha de destino), então a sequência é conferida pelo teste de paridade decisão a decisão (`packages/bots/src/parity.test.ts`, que entra com o OG-053 na mesma pilha): **todas as decisões dos 600 frames de outgun1 (e dos outros 4 cenários) idênticas ao original**, inclusive as de navegação.
- Critério 2: `navigation.test.ts` — sozinho no mapa, com destino fixo e a física da sim, o bot chega a todas as áreas alcançáveis de outgun1 (1.260 pares), verde (110) e ksii (240), sem ficar preso (média de 35 a 67 frames por viagem).
