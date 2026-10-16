# OG-299 — Placar completo no TAB (Moderno e Personalizado)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S26 |
| Status | Em revisão |
| Dependências | [OG-298](OG-298-hud-moderno.md) |
| Regras de negócio | RN-UI-07 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no HUD Moderno, quero ver os frags e os pings segurando TAB, para conferir a partida só quando eu quiser.

## Contexto
Protótipo aprovado pelo PO em 2026-10-16: `plan/specs/hud-moderno/prototipo-hud-moderno.html` (opção A). Decisão D-55.

## Escopo
- Com TAB pressionado, o placar dos dois times (nome, frags, ping, quem leva a bandeira, capturas do time) aparece centralizado sobre a sala; some ao soltar.
- No Clássico, TAB continua trocando os frags pelos pings no placar da coluna.

## Critérios de aceite
- [x] TAB mostra e esconde o placar no Moderno e no Personalizado.
- [x] Clássico sem mudança.

## Notas técnicas
## Notas de implementação
- `drawTabScoreboard`: painel centralizado na sala, times lado a lado (nome, frags, ping, bandeira levada, você destacado), ordenado por frags; usa o `showPings` que o TAB já mandava. No Clássico nada mudou.
- Capturas por jogador não estão no estado do HUD (só frags e ping); ficam no F4, como antes.
