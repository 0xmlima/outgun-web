# OG-297 — Opção "Estilo do HUD" e layout por componentes

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S26 |
| Status | Em revisão |
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
- [x] A opção aparece, salva, sincroniza com a conta e troca o HUD durante a partida.
- [ ] Clássico sem diferença no `pnpm visual:check`.
- [x] Testes de `parsePrefs` e de `screenLayout` para o estilo.

## Notas técnicas
## Notas de implementação
- `game/hud/hud-style.ts` (estilos, componentes, formato do Personalizado e `parseHudCustom`) e `game/hud/modern-layout.ts` (Moderno, Personalizado, âncoras, empurrar para fora da sala). `screenLayout()` recebe estilo e layout; no Clássico devolve exatamente o de antes (teste compara as duas chamadas), nos outros o modo é `componentes` e `hud` traz o lugar de cada componente.
- Preferências `hudStyle` (padrão `classic`) e `hudCustom` vão para a conta como as outras (53 de 64 campos, bem abaixo dos 16 KB).
- `visual:check` do Clássico fica para o fechamento.
