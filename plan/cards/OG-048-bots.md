# OG-048 — Bots

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 13 pts |
| Sprint | S10 |
| Status | Quebrado |
| Dependências | [OG-042](OG-042-snapshots-aoi.md) |
| Regras de negócio | RN-BOT-01, RN-BOT-02, RN-BOT-03 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero bots que completem as salas e joguem CTF de forma crível.

## Contexto e referências no original
- `src/robot.cpp` (2,1k linhas), `src/robot.h`, `src/bot_support.*` (AreaMap, tabelas de distância).
- `names.cpp` (nomes).
- Settings `min_bots`, `bots_fill`, `balance_bot`, `bot_ping`.

## Escopo
- **Quebrar no refinamento** em: (a) AreaMap e distâncias, (b) navegação e destinos, (c) mira e tiro, (d) decisões de bandeira/power-up, (e) gestão de população.
- Bots rodam no game server como clientes virtuais usando apenas snapshots + inputs.

## Critérios de aceite
- [ ] Partida bot × bot no mapa `outgun1` tem resultados estatisticamente semelhantes ao original (capturas/partida ±20% em 50 partidas).
- [ ] Bots não consomem mais que 1 ms por tick com 30 bots.

## Notas técnicas
- `robot.cpp:750` usa `Coords(rand() % S_W, rand() % S_H)`: o primeiro `rand()` vai para o y (avaliação da direita para a esquerda no GCC, descoberto no OG-025).
- Usar o modo `botTestMode` do original (`server.cpp`) para gerar estatísticas de referência.

## Notas de implementação
- Refinamento da S10: quebrado em [OG-050](OG-050-bot-areamap.md) (AreaMap), [OG-051](OG-051-bot-navigation.md) (navegação), [OG-052](OG-052-bot-combat.md) (mira/tiro), [OG-053](OG-053-bot-brain.md) (bandeira/power-up e laço) e [OG-054](OG-054-bot-population.md) (população). Os critérios de aceite foram para o OG-053.
- Achado do OG-027: no original, `random_wild_flag 1` com bots derruba o servidor ao iniciar (segfault reproduzido no oráculo). A IA dos bots precisa lidar com bandeiras removidas na carga do mapa (`random_wild_flag` e locks) — ver [bandeiras-captura.md](../specs/bandeiras-captura.md).
