# OG-301 — Faixa da série do Ranked fora da sala no HUD Moderno e no Personalizado

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | [OG-298](OG-298-hud-moderno.md) |
| Regras de negócio | RN-UI-07 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de uma série Ranked no HUD Moderno, quero ver o placar da série sem que ele cubra a sala, para não ter ponto cego.

## Contexto
Achado da S26: a faixa do placar da série (OG-257, `.series-bar` em `apps/web/src/styles.css`) fica no topo central da tela. No Clássico esse lugar é a faixa do chat; no Moderno e no Personalizado é o alto da sala (D-55 não admite nada permanente sobre ela).

## Escopo
- Nos estilos Moderno e Personalizado, a faixa vai para junto do placar dos times (abaixo dele, na coluna) ou vira parte do componente de placar.
- Clássico sem mudança.

## Critérios de aceite
- [ ] Série Ranked no Moderno sem nada sobre a sala, conferida numa partida.
- [ ] Clássico sem diferença no `visual:check`.

## Notas técnicas
## Notas de implementação
