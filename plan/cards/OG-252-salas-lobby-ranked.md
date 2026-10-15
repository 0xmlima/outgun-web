# OG-252 — Salas de lobby Ranked: criar, listar e entrar (com senha opcional)

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S17 |
| Status | Em revisão |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md) |
| Regras de negócio | RN-RKL-05, RN-RKL-06, RN-RKL-07, RN-MOD-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de Ranked, quero ver as salas abertas e entrar num lobby antes da partida, para só jogar quando o time estiver completo.

## Contexto
- Hoje "Ranked" leva direto à partida (quick-join, `apps/api/src/routes/join.ts`); sala privada só existe no Casual (RN-CFG-03).

## Escopo
- Game server: sala Ranked ganha fases `lobby → voto → prontos → contagem → jogo → (próximo jogo da série: voto) → fim`; no `lobby` ninguém entra no mapa.
- A partida só começa com a sala completa (2 × N jogadores com conta, D-40). Quem sai no lobby libera a vaga.
- API: criar sala Ranked (formato, série, senha opcional ≤ 15 caracteres, regras travadas); lista de salas Ranked abertas com formato, série, ocupação, fase, cadeado e região; entrar exige conta e a senha, quando houver.
- Sala vazia no lobby é fechada após um tempo; sala em jogo não aceita entradas novas (só entre jogos da série, se houver vaga — D-43).

## Critérios de aceite
- [x] Com 5 de 6 jogadores num 3x3, ninguém entra no mapa.
- [x] Senha errada é recusada sem revelar nada da sala; convidado é recusado (RN-MOD-03).
- [x] Testes das transições de fase e de entrada/saída no lobby.

## Notas técnicas
- Revisa RN-MOD-04 e RN-CFG-03: Ranked passa a ter senha, mas as regras continuam travadas (D-44).
- O estado do lobby trafega pelo mesmo WebSocket da sala (mensagens novas em `packages/protocol`).

## Notas de implementação
- Máquina de fases pura em `apps/game-server/src/ranked-lobby.ts` (inclui voto/prontos/contagem do OG-254); a `Room` com `ranked` a consulta: fora de `game` o mundo fica parado (ninguém nasce), o jogo começa com `nextMap('vote', mapa)` e o fim de um jogo volta ao lobby sem trocar de mapa (D-41). Série acabada → sala fecha depois do placar.
- Protocolo: `lobbyState` (s2c) e `lobbyReady`/`lobbyVote`/`lobbySide`/`lobbySwapAnswer` (c2s), códigos 120–124; sem subir `PROTOCOL_VERSION` (só salas novas usam).
- API: `POST /rooms/ranked`, `GET /rooms?format=`, `phase` no heartbeat (`rooms.phase`); entrada confere conta antes da senha e recusa `room_in_game`. Sala de lobby fechada pelo servidor é apagada (não reabre). Quem cai fora do jogo libera a vaga na hora.
- Provisório: sala recém-criada só aparece na lista quando abre (o criador entra logo, OG-255). A sala `ranked` antiga do seed e o "Jogar agora" Ranked continuam até o cliente do OG-255.
