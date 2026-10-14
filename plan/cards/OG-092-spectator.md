# OG-092 — Espectador ao vivo

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Port |
| Prioridade | Could |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Concluído |
| Dependências | [OG-090](OG-090-replay-recording.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec` |

## História
Como espectador, quero assistir partidas ao vivo com atraso, sem atrapalhar os jogadores.

## Contexto e referências no original
- `spectating_delay (120 s)` no gamemod, `Menu_spectate`.

## Escopo
- Espectador recebe o stream de replay com atraso configurável.
- Limite de espectadores por sala.

## Critérios de aceite
- [x] Atraso respeitado; espectador não aparece como jogador.

## Notas técnicas
- —

## Notas de implementação
- Spec: [plan/specs/replays.md](../specs/replays.md), seção "Espectador ao vivo".
- Servidor: `spectators.ts` (stream com atraso, limite `MAX_SPECTATORS`, padrão 16), rota `/rooms/:id/spectate`, mensagem `spectatorStart` (protocolo 4), sala grava sempre o stream; variável `GAMEMOD` para dev. API: `spectateUrl` no resumo da sala (null com senha). Web: `/spectate` (player do OG-091 em modo ao vivo) e "Assistir ao vivo" na página da sala.
- Critério: `spectators.test.ts` — com `spectating_delay 5` o espectador recebe exatamente o frame de 50 frames atrás; não aparece como jogador (`playerCount` igual, sem `playerJoined`); o stream toca no `ReplayPlayer` e reproduz as posições do servidor; partida nova manda outro `spectatorStart`; limite por sala; sair para de receber. E2E no navegador (game server com `GAMEMOD="spectating_delay 3"`, 1 humano + 7 bots): espectador ~3 s atrás (frame 122 com o servidor em 154) e o servidor contando 8 jogadores.
- Divergência: sem relay; salas com senha não são assistíveis (confirmado pelo PO em 2026-10-14). Print: `tools/parity/out/prints/og092-spectator.png`.
