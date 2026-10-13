# OG-051 — Bots: navegação até destinos

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Pronto |
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
- [ ] Cenário de paridade: bot com destino fixo gera a mesma sequência de controles do original por ≥ 600 frames em `outgun1`.
- [ ] Bot chega ao destino em todos os pares de áreas de 3 mapas (teste de propriedade, sem ficar preso).

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
(preenchido durante a execução)
