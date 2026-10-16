# OG-300 — HUD Personalizado: editor de posição e tamanho dos componentes

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 8 pts |
| Sprint | S26 |
| Status | Pronto |
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
- [ ] Editar, salvar, cancelar e restaurar funcionam; o layout vale na partida e em outra resolução.
- [ ] Nenhuma combinação deixa componente sobre a sala.
- [ ] Testes do cálculo do layout personalizado (âncoras, empurrar para fora da sala, valores inválidos).

## Notas técnicas
## Notas de implementação
