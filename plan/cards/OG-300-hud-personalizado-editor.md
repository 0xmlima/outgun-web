# OG-300 — HUD Personalizado: editor de posição e tamanho dos componentes

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 8 pts |
| Sprint | S26 |
| Status | Concluído |
| Dependências | [OG-298](OG-298-hud-moderno.md) |
| Regras de negócio | RN-UI-07 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero mover, aumentar e esconder cada parte do HUD, para montar o HUD do meu jeito.

## Contexto
Protótipo aprovado pelo PO em 2026-10-16: `plan/specs/hud-moderno/prototipo-hud-moderno.html` (opção A). Decisão D-55.

## Escopo
- Opções › Gráficos › "Editar HUD personalizado…" abre o editor em tela cheia, com uma partida de exemplo desenhada.
- Sala à esquerda ou centralizada; componentes (placar, minimapa, vida, energia, power-ups, arma, chat, FPS) arrastáveis, com tamanho e opção de esconder. Começa do Moderno; "Restaurar" volta a ele.
- **Nenhum componente pode cobrir a sala** (D-55): o editor não deixa soltar sobre ela; numa resolução diferente da do editor, o componente que cair sobre a sala é empurrado para a lateral ou encolhido.
- Cada componente é salvo como âncora (9 pontos), deslocamento em fração da altura e escala relativa à do HUD, numa preferência `hudCustom` sincronizada com a conta.

## Critérios de aceite
- [x] Editar, salvar, cancelar e restaurar funcionam; o layout vale na partida e em outra resolução.
- [x] Nenhuma combinação deixa componente sobre a sala.
- [x] Testes do cálculo do layout personalizado (âncoras, empurrar para fora da sala, valores inválidos).

## Notas técnicas
## Notas de implementação
- Rota `/options/hud` (`screens/HudEditor.tsx`, carregada sob demanda, sem PixiJS): prévia em canvas 2D (`game/hud/hud-preview.ts`), caixas arrastáveis com canto para o tamanho, grade de 8 px e encaixe nas bordas da tela e da sala; o painel fica no meio da sala. Soltar sobre a sala devolve o componente; trocar a sala recomeça do Moderno ajustado a ela. Esc cancela.
- Formato salvo: âncora (9 pontos) + deslocamento, largura, altura e escala do texto em fração da altura da tela; escala do texto limitada a 0,5–2,5× a do HUD. Em outra resolução, cada componente vai para o lugar livre mais próximo da âncora (nem sala nem outro componente) e só encolhe se não couber (`freeSpot`).
- Conferido: editor em 1920×1080 e 1024×768, layout salvo aplicado numa partida online com bots nas quatro resoluções.
