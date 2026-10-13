# OG-054 — Bots: população automática e nomes

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S10 |
| Status | Pronto |
| Dependências | [OG-042](OG-042-snapshots-aoi.md) |
| Regras de negócio | RN-BOT-01, RN-BOT-03 |
| Skills | `outgun-re-spec` |

## História
Como jogador de Casual, quero que a sala se complete com bots e que eu substitua um bot ao entrar, para sempre ter partida.

## Contexto e referências no original
- `src/server.cpp` (`min_bots`, `bots_fill`, `balance_bot`, adição/remoção de bots).
- `src/names.cpp` (listas `classic` e `fi`).
- `Room.addBot` já existe no game server (bot marcado, sem IA); critério pendente do OG-049.

## Escopo
- Preenchimento automático no Casual; substituição de bot por humano com sala cheia; bot de equilíbrio.
- Nomes das listas originais, bots marcados na UI, sem voto e sem ranking.
- Ranked continua recusando bots (D-11).
- Comando `/bot` de moderação (deixado para o OG-048 na D-21).

## Critérios de aceite
- [ ] Testes do game server para `min_bots`, `bots_fill` e `balance_bot` com as mesmas contagens do original.
- [ ] Humano entrando em sala cheia substitui um bot; Ranked nunca tem bots.
- [ ] Bots não votam nem geram delta de ranking.

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
(preenchido durante a execução)
