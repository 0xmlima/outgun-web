# OG-004 — Constantes, unidades e RNG glibc em TS

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S1 |
| Status | Backlog |
| Dependências | [OG-001](OG-001-monorepo-setup.md) |
| Regras de negócio | RN-MAP-01, RN-FIS-08 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como dev, quero as constantes e unidades do original centralizadas e um RNG compatível com a glibc, para que toda a sim use a mesma base e os testes de paridade sejam possíveis.

## Contexto e referências no original
- `src/commont.h:280-320` (plw, plh, raios, MAX_*).
- `src/world.h:39` (POWERUP_RADIUS, FLAG_RADIUS).
- `WorldBase::shot_deltax`.
- glibc `rand()` (TYPE_3, gerador aditivo com 344 descartes iniciais).

## Escopo
- `packages/sim/src/constants.ts` com comentários citando a origem.
- Helpers de unidade: `secondsToFrames`, `framesToSeconds`, `iround`, `positiveModulo`, truncamentos `static_cast<int>`.
- `GlibcRand` (srand/rand idênticos à glibc) + interface `Rng` injetável; `randomShuffle` compatível com `std::random_shuffle` da libstdc++ usada no build.

## Critérios de aceite
- [ ] Teste: sequência de `GlibcRand(seed).rand()` bate com 10.000 valores gerados pelo C++ no container do OG-002.
- [ ] Teste: `randomShuffle` bate com `std::random_shuffle` para vetores de 1..32 elementos.
- [ ] Nenhum número mágico de gameplay fora de `constants.ts` ou settings.

## Notas técnicas
- `random_shuffle` da libstdc++ usa `rand() % (i+1)` — confirmar na versão do container.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
