# OG-318 — Espectador com 30 s de atraso

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Melhoria |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S30 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como espectador, quero ver a partida com pouco atraso, porque 2 minutos é tempo demais num jogo tão rápido quanto o Outgun.

## Contexto
- Pedido do PO em 2026-10-20, antes do primeiro jogo competitivo. Hoje todas as salas usam o `spectating_delay` padrão do original, 120 s (`packages/settings/src/types.ts:303`).
- O atraso continua necessário: impede que alguém assista ao vivo e passe posições para um time. 30 s bastam para isso.

## Escopo
- Padrão de `spectating_delay` passa a 30 s em todos os presets (Casual e Ranked). O `/set spectating_delay` de admin continua valendo.
- Registrar a mudança como decisão D-NN (PLAN seção 12).

## Critérios de aceite
- [x] Sala nova sem gamemod manda `spectatorStart` com `delay: 30` e o espectador fica 300 frames atrás.
- [x] Teste de `spectators.test.ts` cobrindo o padrão novo.

## Notas técnicas
- O padrão do `CLASSIC_GAMEMOD` (texto do original) pode ficar em 120; vale o padrão de `types.ts`, a menos que o preset aplique o gamemod clássico por cima (conferir).

## Notas de implementação
- `SPECTATING_DELAY = 30` aplicado em `classicSettings()` depois do `gamemod.txt` (que traz 120) e no padrão do código; vale para todos os presets. D-56.
- Teste novo em `spectators.test.ts` (sala sem gamemod: `delay: 30`, 300 frames atrás).
