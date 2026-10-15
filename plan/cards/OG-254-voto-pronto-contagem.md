# OG-254 — Voto de mapa, "Pronto" e contagem de 5 s

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S16 |
| Status | Backlog |
| Dependências | [OG-251](OG-251-rotacao-ranked-por-formato.md), [OG-252](OG-252-salas-lobby-ranked.md) |
| Regras de negócio | RN-RKL-10, RN-RKL-11, RN-RKL-12 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de Ranked, quero votar no mapa e confirmar que estou pronto, para a partida só começar quando todos concordarem.

## Escopo
- Voto de mapa com a sala completa: só mapas da rotação do formato (OG-251); em série o voto é normal, mapas podem repetir (D-41). Encerra quando todos votam ou em 30 s; empate → sorteio entre os empatados; sem votos → sorteio na rotação.
- Depois do voto, cada jogador marca "Pronto" (e pode desmarcar).
- Todos prontos → contagem de 5 s; desmarcar, trocar de lado, sair ou entrar alguém cancela a contagem e volta para "prontos".
- Ao fim da contagem, o mapa carrega e a partida começa para todos juntos.

## Critérios de aceite
- [ ] Testes das regras de voto (fim por todos/tempo, empate, sem votos).
- [ ] Testes da contagem: cancela com cada evento listado e recomeça do zero.

## Notas técnicas
- Quem não marca "Pronto" em 60 s após o voto sai da sala e a vaga reabre (D-43, RN-RKL-11b).

## Notas de implementação
(preenchido durante a execução)
