# OG-467 — Volta a opção "Destacar a si mesmo ao nascer"

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S50 |
| Status | Em revisão |
| Dependências | — |
| Issue | [#23](https://github.com/thiagovasconcellos/outgun-web/issues/23) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero poder desligar o destaque que aparece em mim quando nasço.

## Contexto
- Issue #23 (Partida/HUD; Médio). 2.49.1, Steam no Windows, coiote. "Destacar-se ao nascer ficou fora das opções": o destaque continua ligado e não há como tirar. O PO confirmou em 2026-10-28: o pedido é ter de volta o interruptor que liga/desliga o destaque.
- Causa: o OG-386 aposentou a opção (`spawnHighlight` em `RETIRED_PREFS`, `prefs.tsx:216`), que agora vale sempre o padrão `true`. O HUD ainda respeita a flag (`online-hud.ts:329`), e o texto já está no i18n ("Highlight self after spawn").

## Escopo
- Tirar `spawnHighlight` de `RETIRED_PREFS` e pôr de volta o interruptor nas Opções (gráficos/HUD), com padrão ligado.
- Não muda a aparência do destaque (RN-UI-05).

## Critérios de aceite
- [x] A opção aparece nas Opções e desligá-la tira o destaque ao nascer.
- [x] Quem nunca mexeu continua com o destaque ligado.
- [ ] PO confere.

## Notas de implementação
- `spawnHighlight` saiu de `RETIRED_PREFS` (OG-386) e voltou às Opções > gráficos, depois de "Mostrar números dos jogadores", com o texto que já existia no i18n. O valor salvo volta a valer; o padrão continua ligado (teste em `graphics-options.test.ts`).
