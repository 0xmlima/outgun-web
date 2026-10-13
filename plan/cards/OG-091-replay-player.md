# OG-091 — Player de replay

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S10 |
| Status | Pronto |
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
- [ ] Seek para qualquer ponto em < 2 s.
- [ ] Mesmos controles do original disponíveis.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
