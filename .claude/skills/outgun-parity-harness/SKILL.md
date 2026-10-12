---
name: outgun-parity-harness
description: Gera golden traces a partir do Outgun original compilado em Docker e compara com a simulação TypeScript (packages/sim). Use ao implementar ou alterar qualquer card do épico E2 (simulação), nos cards OG-002, OG-003, OG-004 e OG-100, ao investigar divergência de física/regras entre a versão web e o original, ou para gravar um novo cenário de teste.
---

# Outgun — harness de paridade

Princípio: **o binário original é o oráculo**. Nenhum card da simulação fecha sem que o comportamento seja comparado com um trace gerado pelo C++.

## Estrutura
```
tools/parity/
├─ docker/                  # oráculo: Dockerfile + entrypoint (OG-002)
├─ patches/001-trace.patch  # -trace/-tracescript no original; nunca editar src/ direto
├─ scenarios/<nome>.txt     # roteiro do cenário (formato em trace-schema.md)
├─ traces/<nome>.jsonl.gz   # golden traces versionados
├─ fixtures/*.cpp           # programas ligados ao código original (pnpm oracle fixture)
├─ trace-schema.md          # formato do cenário e do trace, passo a passo
└─ src/                     # pacote @outgun/parity: loadTrace, runParity, RecordedRng, firstDifference
```

## Oráculo
`pnpm oracle build` constrói a imagem; `pnpm oracle help` lista os modos. Pontos-chave (detalhes em `tools/parity/README.md`):
- `-bottest` do original: lockstep com bots e tempo acelerado (~1 s por 100 frames de trace).
- O container roda sem rede (`--network none`).
- Dois tipos de referência: **fixtures** (funções isoladas, ex. interseções, parser, RNG) e **traces** (frames completos).

## Gravar um trace
1. Crie `tools/parity/scenarios/<nome>.txt` (diretivas `map`, `bots`, `start`, `frames`, `seed`, `players`, `at`, `input`; veja `trace-schema.md`).
2. `pnpm oracle trace <nome>` → `tools/parity/traces/<nome>.jsonl.gz`.
3. `pnpm --filter @outgun/parity test` valida a estrutura de todos os traces.

## Comparar com a sim TS
Implemente um `SimAdapter` (`setup(header)`, `load(state)`, `step(rng, time)`) que converte entre o formato do trace (`TraceState`) e a sim, e rode `runParity(trace, adapter, { select, mode })`:
- `mode: 'resync'` (padrão): carrega o `pre` do original a cada frame e compara o `post`.
- `mode: 'free'`: só o primeiro frame é carregado; a sim anda sozinha (cenários roteirizados).
- `select`: recorte dos campos que o card já implementa (ex. só `pos`/`vel` no OG-021).
- `RecordedRng` entrega os `rand()` do original e acusa consumo a mais ou a menos.
- `time`: valor de `get_time()` gravado; a sim recebe o tempo como entrada (decisão D-09).
- `formatFailure` gera a mensagem com o primeiro frame e o caminho do campo divergente.

## Cenários mínimos por área
| Área | Cenários |
|---|---|
| Movimento (OG-021) | reto, diagonal, correr, turbo, bandeira, strafe, frear, curva, wrap nas 4 bordas |
| Paredes (OG-020) | retângulo, canto, triângulo, círculo, anel, setor, quina entre duas paredes |
| Tiro (OG-022) | nível 1–9 × 8 direções, parede próxima, energia zerada |
| Dano (OG-024) | acerto, shield (energia e N acertos), friendly fire, morte |
| Power-ups (OG-025) | 3.000 frames com seed fixa; pegar cada tipo; limite por jogador |
| Deathbringer (OG-026) | explosão com 0/1/N alvos, aliado com friendly_db |
| Bandeiras (OG-027) | pegar, largar, devolver, capturar, wild, locks, carry_own_team_flag |
| Partida (OG-029) | time limit, extra time, sudden death, respawn balanceado |

## Ao encontrar divergência
1. Reproduza com o menor cenário possível.
2. Leia o C++ (skill `outgun-re-spec`) para a etapa do frame onde diverge.
3. Corrija a sim TS — **não** ajuste o trace. Diferenças da ordem de 1e-15 em funções trigonométricas (V8 × glibc) são aceitáveis com tolerância; qualquer coisa maior é bug. Se a divergência for intencional, registre em PLAN.md seção 12 e marque o campo como ignorado no cenário com justificativa.
