# OG-466 — Tolerância de diagonal ajustável de 1 em 1 ms

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S50 |
| Status | Concluído |
| Dependências | — |
| Issue | [#22](https://github.com/thiagovasconcellos/outgun-web/issues/22) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero escolher uma tolerância de diagonal menor que 5 ms.

## Contexto
- Issue #22 (Partida/HUD; Médio). 2.49.1, Steam no Windows, coiote. Pedido: valor mínimo de 1 ms (hoje o menor valor ligado é 5 ms).
- Causa: o `SliderField` da tolerância em `ControlsScreen.tsx:87` usa `step={5}`. O `prefs.tsx:274` já aceita qualquer inteiro entre 0 e `CHORD_WINDOW_MAX_MS`.

## Escopo
- Passo de 1 ms no controle (0 = desligado). Mantém o padrão `CHORD_WINDOW_DEFAULT_MS`.

## Critérios de aceite
- [x] Dá para escolher 1, 2, 3 e 4 ms.
- [ ] PO confere.

## Notas de implementação
- `ControlsScreen.tsx`: o controle anda de 1 em 1 ms (0 continua desligando; padrão de 30 ms mantido). É o ajuste que resolve a issue #18 (ver OG-462).
