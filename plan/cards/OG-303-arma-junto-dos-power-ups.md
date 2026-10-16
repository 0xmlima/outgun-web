# OG-303 — Arma no mesmo padrão e na mesma linha dos power-ups (HUD Moderno)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S27 |
| Status | Em revisão |
| Dependências | [OG-298](OG-298-hud-moderno.md) |
| Regras de negócio | RN-UI-07 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no HUD Moderno, quero ver o nível da arma no mesmo formato de Power, Turbo e Shadow, para ler tudo de uma vez.

## Contexto
Sugestão do PO em 2026-10-16, depois da S26: "Arma" tinha um visual próprio (legenda e quatro marcas) numa linha separada.

## Escopo
- Componente de power-ups com quatro quadros iguais na mesma linha: Power, Turbo, Shadow e Arma.
- O quadro da arma mostra o nível (1 a 4); aceso, na cor do nível, quando passa de 1.
- O componente "Arma" separado deixa de existir (Moderno, Personalizado e editor); layouts personalizados já salvos continuam valendo.
- Clássico sem mudança.

## Critérios de aceite
- [x] Quatro quadros iguais na mesma linha no Moderno e no Personalizado.
- [x] Layout personalizado salvo antes continua carregando.
- [x] Clássico sem diferença no `visual:check`; série `moderno-` regravada.

## Notas técnicas
## Notas de implementação
- `drawPowerups` desenha quatro quadros (Power, Turbo, Shadow, Arma); a arma mostra o nível e acende na cor `pup_weapon_N` acima do 1. O componente `weapon` saiu de `HUD_COMPONENTS`; a chave em layouts salvos é ignorada (teste). Tamanho base dos power-ups passou a 248×46 para caber os quatro.
- Editor: "Power-ups e arma". Conferido numa partida online com bots (1920×1080 e 1024×768); série `moderno-` regravada, Clássico e `classico-tab-` sem diferença.
