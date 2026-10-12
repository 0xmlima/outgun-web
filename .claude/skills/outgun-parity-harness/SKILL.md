---
name: outgun-parity-harness
description: Gera golden traces a partir do Outgun original compilado em Docker e compara com a simulação TypeScript (packages/sim). Use ao implementar ou alterar qualquer card do épico E2 (simulação), nos cards OG-002, OG-003, OG-004 e OG-100, ao investigar divergência de física/regras entre a versão web e o original, ou para gravar um novo cenário de teste.
---

# Outgun — harness de paridade

Princípio: **o binário original é o oráculo**. Nenhum card da simulação fecha sem que o comportamento seja comparado com um trace gerado pelo C++.

## Estrutura esperada
```
tools/parity/
├─ docker/Dockerfile        # toolchain antiga + Allegro 4.4 + HawkNL (OG-002)
├─ patches/*.patch          # mudanças no original (trace, seed, entradas roteirizadas) — nunca editar src/ direto
├─ scenarios/<nome>.json    # mapa, settings, seed, jogadores, entradas por frame
├─ traces/<nome>.jsonl.gz   # saída do original, versionada
├─ trace-schema.md
└─ compare.ts               # roda packages/sim com o mesmo cenário e compara
```

## Oráculo (pronto no OG-002)
`pnpm oracle build` constrói a imagem; `pnpm oracle help` lista os modos (`server`, `replay`, `mappic`, `mapgen`, `compile-commands`). Detalhes e comportamentos descobertos em `tools/parity/README.md`. Pontos-chave:
- `server --bottest` usa a opção não documentada `-bottest` do original: lockstep com bots e tempo acelerado. Use-a para gerar traces rapidamente.
- O build original usa `-ffast-math`; compile uma variante sem a flag (`--build-arg OUTGUN_CXXFLAGS=...`) para medir o impacto na paridade.
- O container roda sem rede (`--network none`).

## Gravar um trace
1. Escreva `scenarios/<nome>.json`: `map`, `settings` (preset + overrides), `seed`, `players` (time, nome), `inputs` (por frame: bitmask de controles, fire, drop, suicide) e `frames` (duração).
2. Rode no container (modo `trace`, a ser criado no OG-003 sobre `tools/parity/oracle.sh`), gerando `traces/<nome>.jsonl`, e comprima.
3. Cada linha do JSONL é um frame: `frame`, `order` (ordem de jogadores após `random_shuffle`), `players[]` (pos sala/x/y, vel, gundir, health, energy, itens e tempos, dead, frags), `rockets[]`, `powerups[]`, `flags[]`, `teams[]` (score), `events[]` (kill, capture, take, return, drop, pup, db).

O patch de trace deve:
- chamar `srand(seed)` antes de qualquer outra coisa;
- ler entradas do cenário em vez da rede (injetar em `ServerPlayer::controls`, `attack`, `drop_key`, etc. no início de cada frame);
- serializar o estado **depois** de `simulateFrame`;
- usar `printf("%.17g")` para doubles (round-trip exato).

## Comparar
`pnpm parity <nome>` (ou `pnpm parity --all`) executa `compare.ts`:
- a sim TS usa `GlibcRand(seed)` (OG-004) e o mesmo `randomShuffle`;
- compara frame a frame, campo a campo; tolerância padrão `1e-9` absoluta para doubles, igualdade exata para inteiros/enum;
- para no **primeiro** frame divergente e imprime o caminho do campo, valor esperado, obtido e o diff do frame anterior.

`sin`, `cos`, `sqrt` podem diferir em ULPs entre a libm do container e o V8. Se a divergência for só de ULP e se acumular, use o modo `--resync` (copia o estado do trace para a sim a cada frame) para testar a lógica do frame isoladamente; o modo sem resync deve passar pelo menos para os cenários curtos (≤ 300 frames).

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
3. Corrija a sim TS — **não** ajuste o trace. Se a divergência for intencional, registre em PLAN.md seção 12 e marque o campo como ignorado no cenário com justificativa.
