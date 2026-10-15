# OG-266 — Níveis de dificuldade dos bots e nível do bot substituto pelo histórico

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S20 |
| Status | Concluído |
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
- [x] Testes do cálculo do nível (com e sem histórico, extremos).
- [x] Medição uma vez, no fechamento (script reaproveitável, `botTest`): o nível 5 vence o nível 1 com folga e os níveis são monótonos em K/D.
- [x] Casual sem diferença de comportamento dos bots.

## Notas técnicas
- `packages/bots` usa só o `Rng` injetado; os parâmetros entram por configuração, sem `Math.random`.

## Notas de implementação
- `packages/bots/src/skill.ts`: `aimSpread` (erro de giro livre), `aimMiss` (tiro 1/8 de volta para o lado no giro tradicional), `reactionFrames` (soma ao `bot_ping`) e `decideEvery`. **Nível 4 = o bot atual** (referência, Casual e paridade iguais, sem sorteio a mais): com `bot_ping 100` e giro tradicional (Ranked) só dá para ficar mais forte tirando o frame de atraso (nível 5). Sem histórico = 3, um pouco abaixo do bot atual.
- API (`apps/api/src/bot-level.ts`): metade pelo percentil no leaderboard do formato (fora dele = 0,25), ¼ K/D (2,0 = máximo), ¼ precisão (50% = máximo) nas últimas 20 Ranked; menos de 5 Ranked = 3. Vai no ticket (`botLevel`) e o game server guarda na `Identity`; o `substitute` usa.
- Medição no fechamento (`bot-stats.js --red-level A --blue-level B --set "pups_min 0" --set "pups_max 0"`, 3x3, 20 partidas por lado): 5 × 1 = 20–0 dos dois lados; K/D contra o nível 4: 1 → 0,13 · 2 → 0,29 · 3 → 0,74 · 4 → 1,00 · 5 → 1,65.
