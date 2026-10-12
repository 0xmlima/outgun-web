# OG-003 — Harness de golden traces (paridade)

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Spike |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S1 |
| Status | Backlog |
| Dependências | [OG-002](OG-002-build-original-docker.md) |
| Regras de negócio | RN-FIS-*, RN-TIR-*, RN-VID-* |
| Skills | `outgun-parity-harness`, `outgun-re-spec` |

## História
Como dev da simulação, quero traces frame a frame produzidos pelo original, para comprovar que a simulação TS reproduz exatamente o comportamento do C++.

## Contexto e referências no original
- `ServerWorld::simulateFrame` (`world.cpp:3447`) é o ponto de captura.
- Aleatoriedade via `rand()` e `random_shuffle` (glibc).
- Entradas dos jogadores chegam por `processMessage` (`servnet.cpp:1608`).

## Escopo
- Patch que adiciona `--trace <arquivo> --seed <n>` ao servidor dedicado: `srand(seed)` e, por frame, JSONL com entradas aplicadas, estado de jogadores, foguetes, power-ups, bandeiras, placar e eventos.
- Cenários roteirizados: entradas de jogadores lidas de arquivo (sem rede) para testes unitários de física; e cenário com bots para testes de integração.
- Schema do trace documentado (`tools/parity/trace-schema.md`).
- Biblioteca `tools/parity/compare.ts` que roda a sim TS com as mesmas entradas/seed e compara campo a campo com tolerância configurável.

## Critérios de aceite
- [ ] Pelo menos 10 cenários gravados: andar reto, correr, diagonal, quicar em parede reta/triângulo/círculo, troca de sala com wrap, tiro nível 1 e 9, acerto de foguete, captura.
- [ ] Traces versionados em `tools/parity/traces/` (comprimidos).
- [ ] Comparador reporta o primeiro frame e campo divergente.
- [ ] Documentado como gravar um novo cenário em < 5 minutos.

## Notas técnicas
- **Descoberto no OG-002:** o servidor tem a opção não documentada `-bottest` (`src/main.cpp:317`): lockstep com os bots e tempo acelerado (~0,07 s por partida de 2 min), restart no frame 100, replays mantidos sem humanos. Usar como modo de execução do harness.
- **Descoberto no OG-002:** o build original usa `-ffast-math`. Gravar os primeiros traces com e sem a flag e medir a divergência antes de escolher a referência; registrar a escolha em PLAN seção 12.
- Para paridade de RNG, a sim TS usa `GlibcRand` (OG-004). Em produção, qualquer PRNG.
- Ordem de jogadores é embaralhada por frame (`random_shuffle`) — o trace deve registrar a ordem resultante.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
