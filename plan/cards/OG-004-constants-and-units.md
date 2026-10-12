# OG-004 — Constantes, unidades e RNG glibc em TS

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S1 |
| Status | Em revisão |
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
- [x] Teste: sequência de `GlibcRand(seed).rand()` bate com 10.000 valores gerados pelo C++ no container do OG-002.
- [x] Teste: `randomShuffle` bate com `std::random_shuffle` para vetores de 1..32 elementos.
- [x] Nenhum número mágico de gameplay fora de `constants.ts` ou settings.

## Notas técnicas
- `random_shuffle` da libstdc++ usa `rand() % (i+1)` — confirmar na versão do container.

## Notas de implementação
- **Spec:** `plan/specs/constantes-unidades-rng.md`.
- **Código:** `packages/sim/src/constants.ts`, `math.ts` (`truncToInt`, `iround`, `iroundBound`, `sqr`, `positiveModulo`, `positiveFmod`, `secondsToFrames`, `framesToSeconds`), `rng.ts` (`Rng`, `GlibcRand`, `randomShuffle`).
- **Paridade comprovada:** `GlibcRand` reproduz bit a bit o `rand()` do build original para 8 sequências (sem `srand` e sementes 0, 1, 2, 42, 12345, 2³¹−1, 2³²−1; 1.000 valores cada e 10.000 para a semente 42). `randomShuffle` bate com `std::random_shuffle` para vetores de 1 a 32 elementos, inclusive o estado do gerador depois. 19 testes no pacote.
- **Novo no oráculo:** modo `pnpm oracle fixture NOME`, que compila um programa de `tools/parity/fixtures/` ligado a todos os objetos do servidor original. Usado aqui (`rng.cpp`) e disponível para geometria, mapas e física (OG-010, OG-020+).
- **π:** os literais de 21 dígitos do original viram o double mais próximo; usamos os mesmos valores em precisão de double (iguais a `Math.PI`), conferido em teste.
- `ROOM_WIDTH/HEIGHT` agora existem só em `@outgun/sim`; `@outgun/content` reexporta.
- Ajuste: `pnpm check:licenses` ignora arquivos apagados que ainda estão no índice do git.
- Branch: `og-004-constants-and-units`.
