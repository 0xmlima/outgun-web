# OG-092 — Espectador ao vivo

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Port |
| Prioridade | Could |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Backlog |
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
- [ ] Atraso respeitado; espectador não aparece como jogador.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
