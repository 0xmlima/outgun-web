# OG-374 — Quadro de baixa latência: menos trabalho por quadro e canvas dessincronizado

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 2 pts |
| Sprint | S40 |
| Status | Pronto |
| Dependências | OG-369, OG-373 |
| Regras de negócio | RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador com monitor de 144/240 Hz, quero que cada quadro fique pronto rápido, para aproveitar a taxa do monitor sem engasgos.

## Contexto
- Com o FPS destravado (OG-373), o custo por quadro passa a importar: a 240 FPS o orçamento é 4 ms. Hoje o HUD é reconstruído a cada quadro e a extrapolação clona o mundo inteiro (`extrapolateWith`).

## Escopo
- Medir com o script do OG-369 o tempo de quadro (p50/p95/p99) numa partida de 16 jogadores; atacar só o que aparecer no perfil (ex.: HUD só refeito quando o estado muda, menos clones na extrapolação).
- Testar o contexto WebGL com `desynchronized: true` (canvas de baixa latência do Chromium) no desktop; manter só se não houver rasgos/artefatos.
- Nada muda de lugar no HUD (RN-UI-05): `pnpm visual:check` no fechamento.

## Critérios de aceite
- [ ] Tempo de quadro p95 abaixo de 4 ms na partida de 16 jogadores no computador de referência (ou o achado documentado, com card novo).
- [ ] `pnpm visual:check` passa.

## Notas de implementação
(preenchido durante a execução)
