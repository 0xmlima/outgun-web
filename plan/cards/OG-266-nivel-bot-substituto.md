# OG-266 — Níveis de dificuldade dos bots e nível do bot substituto pelo histórico

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S18 |
| Status | Backlog |
| Dependências | [OG-262](OG-262-voto-bot-substituto.md) |
| Regras de negócio | RN-RKL-19 |
| Skills | `outgun-card-workflow` |

## História
Como time que recebeu um bot substituto, quero que ele jogue mais ou menos como o jogador que caiu, para a partida continuar equilibrada.

## Contexto
- Os bots do OG-050–054 têm um único nível (o do original); o que varia hoje é só o `bot_ping`.

## Escopo
- `packages/bots`: níveis de 1 (fraco) a 5 (forte) com parâmetros explícitos — erro de mira, tempo de reação, atraso (`bot_ping`) e frequência de decisão. O nível atual vira o de referência, documentado.
- API: nível do jogador a partir do histórico **Ranked** (percentil do rating, K/D e precisão nas últimas partidas); calculado ao montar o ticket da sala Ranked e guardado no servidor.
- Sem histórico (menos de 5 partidas Ranked, a confirmar na implementação) → nível **intermediário** (3).
- O Casual continua com o nível atual (sem mudança de comportamento).

## Critérios de aceite
- [ ] Testes do cálculo do nível (com e sem histórico, extremos).
- [ ] Medição uma vez, no fechamento (script reaproveitável, `botTest`): o nível 5 vence o nível 1 com folga e os níveis são monótonos em K/D.
- [ ] Casual sem diferença de comportamento dos bots.

## Notas técnicas
- `packages/bots` usa só o `Rng` injetado; os parâmetros entram por configuração, sem `Math.random`.

## Notas de implementação
(preenchido durante a execução)
