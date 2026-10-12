# OG-048 — Bots

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 13 pts |
| Sprint | S10 |
| Status | Backlog |
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
- Usar o modo `botTestMode` do original (`server.cpp`) para gerar estatísticas de referência.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
