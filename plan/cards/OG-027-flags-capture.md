# OG-027 — Bandeiras e captura

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S4 |
| Status | Em andamento |
| Dependências | [OG-024](OG-024-health-energy-damage.md) |
| Regras de negócio | RN-FLG-01, RN-FLG-02, RN-FLG-03, RN-FLG-04, RN-FLG-05, RN-FLG-06, RN-FLG-07, RN-FLG-08, RN-FLG-09, RN-FLG-10 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero pegar, largar, devolver e capturar bandeiras com as regras do original, inclusive bandeiras selvagens e variantes.

## Contexto e referências no original
- `Flag`, `Team` (`world.h:640-780`, `world.cpp:3927-4070`).
- Pegar/devolver/capturar em `simulatePlayerPostPhysics` (`world.cpp:3240-3365`).
- `try_capture`, `is_near_base_for_capture` (`world.cpp:3367-3445`).
- `player_steals_flag`, `player_captures_flag`, `team_gets_carrying_point` (`world.cpp:3639-3697`).
- `dropFlagIfAny` (`world.cpp:1758`).

## Escopo
- Estados e transições de bandeira.
- Tabela das 13 combinações de captura.
- Locks, delays, tempo mínimo de captura, assistência, pontos por posse, respawn na captura.
- `random_wild_flag`.

## Critérios de aceite
- [x] Teste parametrizado cobrindo cada linha da tabela de captura (yes/no) em cada combinação de settings.
- [ ] Traces de partida completa com bots (capturas e devoluções) idênticos. — o `bots-match` depende do respawn (OG-029) e passa a ser cobrado lá; as capturas e devoluções estão cobertas por 9 traces roteirizados idênticos (abaixo).

## Notas técnicas
- Ler também `doc/gamemod.html` para a semântica das flags de modo.

## Notas de implementação
- Spec: [bandeiras-captura.md](../specs/bandeiras-captura.md). Código em `packages/sim/src/world/server.ts` (seção "bandeiras") e `FlagState` em `state.ts`.
- Paridade (`pnpm parity`, recorte `flagFields`: jogadores, bandeiras e times completos): `flag-capture`, `flag-assist`, `flag-drop-return`, `flag-suicide`, `flag-wild-capture`, `flag-wild-base`, `flag-carry-own`, `flag-locks` e `flag-carrying-score` idênticos ao original em resync; `flag-drop-return` e `flag-suicide` também no modo free. Os demais usam teletransportes no meio do roteiro (só resync).
- `flags.test.ts`: 13 linhas da tabela × 4 combinações de settings (linhas inalcançáveis sem `carry_own_team_flag` ficam de fora), mais `capture_away_from_base`, `min_capture_time`, devolução, locks, carga do mapa, `random_wild_flag` e limite de capturas.
- Largar (tecla) e suicídio usam no original o relógio de parede fora do frame; a sim usa o do frame (D-09). No modo free o adaptador copia do trace só o tempo de posse e de vida acumulados nesses eventos.
- Capturas na sim guardam `{tempo, pid, assistente}`; o nome vem de fora. O limite de capturas chama `hooks.captureLimitReached` (a troca de mapa é do OG-029).
- Achado: `random_wild_flag 1` com bots derruba o servidor original (segfault). Registrado no OG-048.
- Os bots jogam livremente antes do frame inicial do roteiro e, com `carry_own_team_flag`, pegam as próprias bandeiras; `flag-carry-own` larga tudo no frame inicial, e regravá-lo pode exigir mais de uma tentativa.
