# OG-065 — HUD: barras, timers, placar, minimapa, chat

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S7 |
| Status | Pronto |
| Dependências | [OG-062](OG-062-renderer-entities.md) |
| Regras de negócio | RN-VIS-02, RN-PAR-02, RN-CHT-01 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero ver vida, energia, power-ups, placar, tempo, minimapa e mensagens como no original.

## Contexto e referências no original
- `draw_player_health/energy/power/turbo/shadow/weapon`, `draw_map_time`, `draw_scores`, minimapa (`graphics.h:129-190`).
- Mensagens de kill/captura/eventos (`guiclient.cpp`).

## Escopo
- Barras e timers, placar, relógio, minimapa com aliados/inimigos/bandeiras, feed de eventos, chat com histórico (Insert), indicador "Say team".

## Critérios de aceite
- [ ] Todos os elementos do HUD original presentes (checklist).
- [ ] Mensagens traduzidas (OG-014).

## Notas técnicas
- Texto com contorno como o original (OG-013): `border` em (x−1, y−1) por caractere, avançando pela fonte principal; sem contorno, 8 cópias deslocadas.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
