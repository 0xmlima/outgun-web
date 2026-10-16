# OG-297 — Opção "Estilo do HUD" e layout por componentes

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S26 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | RN-UI-07 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero escolher entre o HUD clássico, o moderno e um personalizado, para jogar com o visual que prefiro.

## Contexto
Protótipo aprovado pelo PO em 2026-10-16: `plan/specs/hud-moderno/prototipo-hud-moderno.html` (opção A). Decisão D-55.

## Escopo
- Preferência `hudStyle` (`classic` | `modern` | `custom`, padrão `classic`) em `app/prefs.tsx`, sincronizada com a conta como as outras; vai ao jogo pelo `GraphicsOptions` e vale na hora.
- Opções › Gráficos › Opções gráficas: campo "Estilo do HUD" ao lado da "Escala do HUD"; com Personalizado, o botão "Editar HUD personalizado…" (OG-300).
- `screenLayout()` ganha o estilo; no Clássico a saída é a de hoje, sem nenhuma diferença.

## Critérios de aceite
- [ ] A opção aparece, salva, sincroniza com a conta e troca o HUD durante a partida.
- [ ] Clássico sem diferença no `pnpm visual:check`.
- [ ] Testes de `parsePrefs` e de `screenLayout` para o estilo.

## Notas técnicas
## Notas de implementação
