# OG-062 — Renderer: entidades e efeitos

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S6 |
| Status | Em andamento |
| Dependências | [OG-061](OG-061-renderer-world.md) |
| Regras de negócio | RN-TIM-05, RN-PUP-07 |
| Skills | `outgun-re-spec`, `outgun-asset-pipeline` |

## História
Como jogador, quero ver naves, armas, foguetes, bandeiras, power-ups e efeitos iguais aos do original.

## Contexto e referências no original
- `graphics.h:127-205` (draw_player, draw_rocket, draw_flag, draw_pup, draw_shield, draw_deathbringer, draw_virou_sorvete, efeitos de explosão/turbo/fumaça).

## Escopo
- Jogadores (cor do time + cor pessoal, arma na direção, hit flash, shield, transparência de shadow, nome).
- Foguetes normais e power, explosões em parede.
- Bandeiras (base, carregada, largada), power-ups animados.
- Efeitos: deathbringer (anel, fumaça), turbo, "sorvete" (morto).

## Critérios de aceite
- [ ] Checklist visual aprovado por um veterano do jogo.
- [ ] Sem queda abaixo de 60 fps com 32 jogadores e 256 foguetes.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
