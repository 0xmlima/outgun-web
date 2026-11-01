# OG-534 — Espectador com 15 s de atraso

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Melhoria |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | — |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como quem transmite a OutCup, quero o espectador com 15 s de atraso, para a transmissão ficar mais perto do jogo sem permitir que alguém passe posições a um time.

## Contexto
- Pedido do PO em 2026-11-01 (D-89, revê D-56). Hoje `SPECTATING_DELAY = 30` (`packages/settings/src/presets.ts:87`) e o padrão do código também é 30 (`packages/settings/src/types.ts:303`).

## Escopo
- `spectating_delay` padrão passa a 15 s em todos os presets (Casual, Ranked, 2x2, OutCup, treino). `/set spectating_delay` de admin continua valendo.
- Atualizar comentários que citam 30 s e o teste de `spectators.test.ts` (OG-318).

## Critérios de aceite
- [ ] Sala nova manda `spectatorStart` com `delay: 15` e o espectador fica 150 frames atrás.
- [ ] Teste atualizado.

## Notas de implementação
