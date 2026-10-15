# OG-292 — Tema de menu "Placar" (guardado para um tema futuro)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | [OG-291](OG-291-tema-menu-campo.md) |
| Regras de negócio | RN-UI-01, RN-UI-02, RN-UI-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero poder escolher outro visual para os menus, para variar sem perder a identidade do jogo.

## Contexto
- Segunda direção do protótipo de 2026-10-15 (`plan/specs/menus-tema/prototipo-campo-placar.html`, opção B). O PO aprovou a A (Campo, OG-291) e pediu para guardar esta como um tema futuro de menu (D-53).
- Ideia: o menu é o placar e o minimapa da partida. Fundo preto da tela, cinzas neutros do minimapa, vermelho e azul como estrutura (barra superior dividida, faixas de painel como "Time Vermelho / Time Azul"), amarelo do mastro só na ação principal, com brilho.

## Escopo
- `apps/web/src/ui/theme-placar.css` sob `[data-menu-theme='placar']`, no mesmo molde do `theme-campo.css`, com o teste de contraste equivalente.
- Escolha do tema de menu nas opções (Gráficos), se o PO quiser expor; senão, só troca de `MENU_THEME` na `Shell`.
- Fundo: o mesmo mapa em versão minimapa (`map_wall` #007700 sobre preto, salas com borda `map_room_border` #303030, bases tingidas com a cor do time).

## Tokens propostos (do protótipo)
| Token | Valor | Origem no tema padrão |
|---|---|---|
| `--surface-0` | #000000 | `screen_background` |
| `--surface-1` | #0C0C0D | `stats_bg` |
| `--surface-2` | #151516 | neutro |
| `--surface-3` | #1F1F21 | neutro |
| `--border` | #2C2C2E | `scoreboard_line` |
| `--border-strong` | #5A5A5E | `map_pic_room_border` |
| `--accent` (ação, foco) | #FFE81A | `flag_pole` |
| `--team-red` / faixa | #FF2A1A / #1F0705 | `team_red_basic` / `scoreboard_bg_redteam` |
| `--team-blue` / faixa | #2A46FF / #06081F | `team_blue_basic` / `scoreboard_bg_blueteam` |
| `--text-success` | #4EE24E | `message_info` |
| `--text-warning` | #FFA000 | `normal_message` |
| `--danger` | #FF5A7A | separado do vermelho do time |

## Critérios de aceite
- [ ] Mesmos critérios do OG-291 (só fora da partida, contraste AA, fonte única, navegação igual).
- [ ] Trocar entre Campo e Placar não exige mudar componentes, só o atributo `data-menu-theme`.

## Notas técnicas
## Notas de implementação
(preenchido durante a execução)
