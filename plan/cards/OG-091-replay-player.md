# OG-091 — Player de replay

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S10 |
| Status | Em revisão |
| Dependências | [OG-090](OG-090-replay-recording.md), [OG-065](OG-065-hud.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero assistir replays no navegador com controles de velocidade e câmera.

## Contexto e referências no original
- Teclas de replay em `doc/game.html` (Page Up/Down velocidade, Home normal, P pausa, setas trocam sala, zoom).
- `draw_replay_info` (`graphics.h:233`).

## Escopo
- Player com velocidade, pausa, seek, trocar sala/seguir jogador.
- URL compartilhável com timestamp.

## Critérios de aceite
- [x] Seek para qualquer ponto em < 2 s.
- [x] Mesmos controles do original disponíveis.

## Notas técnicas
- —

## Notas de implementação
- Spec: [plan/specs/replays.md](../specs/replays.md), seção "Player".
- `ReplayPlayer` (netcode) + `replayFrame` no `ClientSession`; `apps/web/src/game/replay-host.ts` (canvas e teclas) e `screens/ReplayScreen.tsx` (`/replay?src=&t=`); menu **Replays** habilitado (`/replays`: abrir arquivo `.ogr` ou ir às partidas do perfil); "Assistir" da página da partida abre o player.
- Critério 1: `apps/game-server/src/replay-player.test.ts` — seek ao fim de 10 min (6.000 frames) < 2 s; no navegador, seek para o fim de 2 min em ~0,3 s. O mesmo teste confere que o replay tocado reproduz as posições e mortes do servidor em todos os frames de uma partida de bots e que seek para trás/frente chega ao mesmo estado (foguetes inclusive).
- Critério 2: PageUp/PageDown (1/32× a 128×), Home, P, setas e +/- do teclado numérico como no original; a mais, F (seguir jogador), barra de posição e link com tempo.
- Fora do v1: sons, minimapa e placar no player (anotado na spec).
- Prints: `tools/parity/out/prints/og091-replay-*.png`.
