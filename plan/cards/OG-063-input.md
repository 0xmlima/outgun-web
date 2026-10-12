# OG-063 — Input: teclado, remapeamento e gamepad

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S6 |
| Status | Em andamento |
| Dependências | [OG-060](OG-060-web-shell.md) |
| Regras de negócio | RN-TIR-10 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero os controles do original (setas, Ctrl atira, Shift corre, Alt strafe) e poder remapear tudo.

## Contexto e referências no original
- `doc/game.html` (Key summary).
- `keyboard.dat`, `Menu_controls` (`client_menus.h:229`).
- Teclas: Delete suicídio, Page Down larga bandeira, Ctrl+End troca time, F1–F12.

## Escopo
- Mapa de teclas padrão do original; remapeamento persistido.
- Gamepad API.
- Evitar conflitos de atalhos do navegador (Ctrl+W etc.) — alternativas documentadas.
- Modo foco (pointer lock opcional).

## Critérios de aceite
- [ ] Todas as ações do Key summary funcionam.
- [ ] Ctrl/Alt não disparam atalhos do navegador durante o jogo (ou têm alternativa padrão).

## Notas técnicas
- Alt e Ctrl têm comportamento especial no navegador; considerar padrão alternativo (ex. Espaço atira) mantendo o clássico como opção.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
