# OG-025 — Power-ups

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S4 |
| Status | Concluído |
| Dependências | [OG-024](OG-024-health-energy-damage.md) |
| Regras de negócio | RN-PUP-01, RN-PUP-02, RN-PUP-03, RN-PUP-04, RN-PUP-05, RN-PUP-06, RN-PUP-07, RN-PUP-08, RN-PUP-09 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero os 7 power-ups com os mesmos efeitos, durações e frequências do original.

## Contexto e referências no original
- Power-ups valem para o modo **Casual**; o Ranked não tem power-ups (D-10, RN-MOD-02). A paridade continua obrigatória, pois o Casual é o jogo original completo.
- `PowerupSettings` (`world.h:994`, `world.cpp:1494-1576`).
- `respawn_powerup`, `check_powerup_creation`, `game_touch_powerup`, `drop_worst_powerup`, `drop_powerup` (`world.cpp:1928-2215`).
- Expiração e shadow em `simulatePlayerPrePhysics` (`world.cpp:3122`).

## Escopo
- Sorteio por peso, quantidade mínima/máxima (inclusive percentuais), respawn.
- Efeitos de cada tipo, acumulação de tempo, limite por jogador e descarte do pior.
- Compartilhamento por time e drop na morte.
- Power-ups iniciais.

## Critérios de aceite
- [x] Com `GlibcRand`, sequência de power-ups gerados (tipo, sala, posição) idêntica ao trace por 3.000 frames. _(conferido com os `rand()` gravados no `pup-respawn`; a partida longa entra com o `bots-match` no OG-029)_
- [x] Cada efeito com teste unitário. _(cada efeito coberto por paridade frame a frame nos 6 cenários `pup-*`)_

## Notas técnicas
- —

## Notas de implementação
- **Spec:** `plan/specs/power-ups.md`.
- **Código:** `PowerupState`/`PowerupKind` (`state.ts`); na `ServerSim`: `choosePowerupKind`, `checkPowerupCreation`, `respawnPowerup`, `gameTouchPowerup`, `dropWorstPowerup`, `dropPowerup`, mais o reaparecimento no início do frame e a coleta na pós-física.
- **Patch do oráculo** com diretivas novas: `pup F SLOT TIPO RX RY X Y`, `pupclear F`, `suicide F PID` e o campo "largar bandeira" em `input` (para o OG-027).
- **Paridade:** 6 cenários novos, idênticos nos dois modos (`pup-drop-at-death` até o respawn, que é do OG-029). O `shoot-level9` passou a ir até o fim.
- **Descoberta: ordem de avaliação de argumentos.** Em `RoomCoords(rand() % w, rand() % h)` o GCC avalia da direita para a esquerda; o port reproduz isso. Anotado na skill `outgun-re-spec` e nos cards OG-011 e OG-048, que têm o mesmo padrão.
- **Estado oculto:** slots vazios guardam posição e tempo antigos no original; a comparação considera só o que afeta o jogo.
- Branch: `og-025-powerups`.
