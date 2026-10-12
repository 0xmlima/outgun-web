# OG-003 — Harness de golden traces (paridade)

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Spike |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S1 |
| Status | Concluído |
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
- [x] Pelo menos 10 cenários gravados: andar reto, correr, diagonal, quicar em parede reta/triângulo/círculo, troca de sala com wrap, tiro nível 1 e 9, acerto de foguete, captura.
- [x] Traces versionados em `tools/parity/traces/` (comprimidos).
- [x] Comparador reporta o primeiro frame e campo divergente.
- [x] Documentado como gravar um novo cenário em < 5 minutos.

## Notas técnicas
- **Descoberto no OG-002:** o servidor tem a opção não documentada `-bottest` (`src/main.cpp:317`): lockstep com os bots e tempo acelerado (~0,07 s por partida de 2 min), restart no frame 100, replays mantidos sem humanos. Usar como modo de execução do harness.
- **Descoberto no OG-002:** o build original usa `-ffast-math`. Gravar os primeiros traces com e sem a flag e medir a divergência antes de escolher a referência; registrar a escolha em PLAN seção 12.
- Para paridade de RNG, a sim TS usa `GlibcRand` (OG-004). Em produção, qualquer PRNG.
- Ordem de jogadores é embaralhada por frame (`random_shuffle`) — o trace deve registrar a ordem resultante.

## Notas de implementação
- **Desenho:** em vez de reproduzir partidas inteiras a partir de uma semente, o trace grava o estado completo **antes e depois de cada `simulateFrame`**, o `get_time()` do frame e os `rand()` consumidos **pela thread da simulação** (via `-Wl,--wrap=rand`). A sim TS carrega o "antes", simula com os mesmos `rand()` e é comparada com o "depois". Motivos:
  - o original reinicia a semente a cada thread (`src/thread.cpp:39`), e bots e simulação compartilham o `rand()` global, então uma semente não reproduz a partida;
  - mensagens entre frames (bots) ficam capturadas no "antes".
- **Patch** `tools/parity/patches/001-trace.patch`: novos `trace.cpp`/`trace.h`, ganchos em `server.cpp` (em volta de `simulateFrame`), `main.cpp` (`-trace`, `-tracescript`) e `servnet.cpp` (jogadores roteirizados ignoram suicídio, largar bandeira, troca de time e tiro do bot), e `Makefile.common` (`trace.o`, `--wrap=rand`). Sem as opções, o jogo é o original.
- **Roteiros:** posicionar jogadores, ajustar vida/energia/arma/power-ups e definir entradas por frame, com a mesma semântica da rede.
- **13 cenários gravados** (≈ 0,5 MB): movimento reto, corrida, diagonal, freada/curva/strafe, turbo, quique em triângulo e em círculo, volta pela borda, tiro nível 1 e 9, acerto de foguete com morte, captura de bandeira, e 600 frames de partida livre com 6 bots. Cada um foi conferido para exercitar o que promete (`trace-schema.md`).
- **Pacote `@outgun/parity`** (`tools/parity/src`): `loadTrace`, `runParity` (modos `resync`/`free`, recorte de campos, tolerância), `RecordedRng`, `firstDifference`, `formatFailure`. 32 testes: estrutura de todos os traces, o harness aceitando a própria gravação e detecção de divergência (frame e campo exatos, `rand()` a mais ou a menos).
- **Descoberta → decisão D-09:** a simulação original usa o relógio do servidor (`get_time()`) para expirações. A web usará relógio determinístico; o harness passa o tempo gravado para a sim.
- **`-ffast-math`:** a comparação com e sem a flag foi adiada. Até aqui nada divergiu (parser, geometria e RNG bit a bit); a variante sem a flag fica documentada para quando surgir uma diferença mínima na física.
- **Não incluído:** registro de eventos de rede (`broadcast_kill`, etc.). As mudanças de estado (estatísticas, placar) já cobrem a lógica; eventos entram com o protocolo (OG-041) se necessário.
- Branch: `og-003-parity-harness`.
