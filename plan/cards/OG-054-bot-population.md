# OG-054 — Bots: população automática e nomes

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S10 |
| Status | Concluído |
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
- [x] Testes do game server para `min_bots`, `bots_fill` e `balance_bot` com as mesmas contagens do original.
- [x] Humano entrando em sala cheia substitui um bot; Ranked nunca tem bots.
- [x] Bots não votam nem geram delta de ranking.

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
- Spec: [bots-populacao.md](../specs/bots-populacao.md); divergências em D-27 (PLAN seção 12).
- `apps/game-server/src/bots.ts`: `neededBots` (`init_bots`), `createBotName` e o port de `names.cpp` (clássico e finlandês). Golden gerado compilando `names.cpp` no oráculo: 36 nomes idênticos (seeds 1–3); confirmou a avaliação da direita para a esquerda em `Silaba()`.
- `Room`: `check_bots` recalculado no começo do frame seguinte a cada entrada/saída/`/bot`/`/set reset`; `addBot`/`removeBot` públicos valem como `/bot add 1`/`/bot remove 1` (`extra_bots`); humano com sala cheia tira um bot (`dropBot`, já existia). Nomes com `GlibcRand(seed + 1)` próprio. `playerName(pid)` novo.
- `/bot` completo em `moderation.ts` (list, add, remove, fill, balance, ping, rename), também para o dono de sala Casual; no Ranked responde "Bots are not allowed in Ranked rooms.".
- Env `CASUAL_BOTS_FILL` no game server (padrão 0, como o `gamemod.txt`). Valor de produção fica para o PO quando houver IA (OG-053).
- Voto e ranking: bots não têm conexão, logo não votam; deltas só existem no Ranked, onde não há bots (D-11); `map-vote.ts` já ignora bots no voto de saída.
- Marca na UI: só o prefixo "BOT ", como o original (o cliente original não exibe `is_bot`).
- Testes: `bots.test.ts` (11) e `bots-room.test.ts` (6); `room.test.ts` ajustado (bots só com humano na sala, D-27).
