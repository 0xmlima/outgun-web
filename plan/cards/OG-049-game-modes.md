# OG-049 — Modos de jogo: Casual e Ranked

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S9 |
| Status | Em revisão |
| Dependências | [OG-030](OG-030-settings-presets.md), [OG-083](OG-083-join-ticket.md), [OG-086](OG-086-room-registry.md) |
| Regras de negócio | RN-MOD-01..06, RN-CFG-01, RN-CFG-03, RN-RNK-01, RN-PLT-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador competitivo, quero um modo Ranked sem power-ups e só com contas, para que o ranking dependa de habilidade; como jogador casual, quero continuar jogando com power-ups, inclusive sem cadastro.

## Contexto e referências no original
- Divergência intencional D-10: o original tem um único modo, definido pelo gamemod de cada servidor; o ranking dependia só de `ranking_id`/`ranking_password` e dos mínimos de jogadores (`src/server.cpp:484`).
- Sem power-ups no original: `pups_min 0`, `pups_max 0` e `pup_start_*` desligados (`PowerupSettings`, `src/world.cpp:1494-1576`; `check_powerup_creation` não cria nada com máximo 0).

## Escopo
- Campo `mode: 'casual' | 'ranked'` na sala (registro, lobby, protocolo e resultado de partida).
- Preset **Ranked** (OG-030) aplicado e travado nas salas Ranked: o servidor recusa `/set` e alterações do dono; rotação de mapas oficial do Ranked.
- Entrada: o game server rejeita, em sala Ranked, ticket de convidado ou sem conta (motivo explícito para a UI).
- Sinalização de partida ranqueada: só salas Ranked enviam resultado para o ranking (OG-084); salas Casual enviam só estatísticas.
- Bots proibidos no Ranked (D-11, RN-MOD-06): o servidor não adiciona bots e recusa comandos/settings que os ativem; no Casual seguem o original.
- Testes de integração cobrindo todas as regras RN-MOD.

## Critérios de aceite
- [x] Em sala Ranked nenhum power-up aparece, nem no spawn nem ao morrer, em 10 minutos de partida simulada.
- [x] Convidado recebe recusa clara ao tentar entrar em Ranked; conta logada entra.
- [x] `/set` e alterações do dono são recusados em Ranked e funcionam em Casual (salas privadas).
- [ ] Partida Casual não altera o ranking; partida Ranked que cumpre os mínimos altera. _(o game server já marca `ranked` só no Ranked com os mínimos; a alteração do rating é do OG-084)_
- [x] Lobby e registro de salas exibem/filtram o modo.
- [ ] Sala Ranked nunca tem bots, mesmo com poucos jogadores ou comando de admin; sala Casual adiciona bots como no original. _(Ranked: feito — `addBot` recusado, `min_bots`/`bots_fill` 0 e travados; Casual: `addBot` aceito, mas o preenchimento automático depende da IA dos bots, OG-048 na S10)_

## Notas técnicas
- A simulação não muda: Ranked é só um preset. Os golden traces do original continuam valendo; o cenário `bots-match` com `gamemod pups_max 0` pode servir de trace do Ranked se for preciso.

## Notas de implementação
- O modo é do preset (`Room.mode`), já presente no registro (`GET /rooms?mode=`, OG-086), no `welcome` do protocolo e no resultado da partida. A UI do filtro fica no lobby (OG-069).
- **Ranked travado**: preset `ranked` (`pups_min/max 0`, `pup_start_*` desligados, `pups_drop_at_death 0`, `min_bots`/`bots_fill` 0) e `/set` recusado em preset travado (já do OG-046). Teste de 10 min (6000 frames, 4 contas trocando tiros, > 10 mortes): nenhum power-up no mapa, no spawn ou largado.
- **Dono da sala privada**: o ticket ganha a claim `owner` (a API põe quando a conta é `rooms.owner_id`); o dono usa `/set` (mesmas regras permitidas ao admin) se o preset não for travado; aparece em `/help` como "Room owner commands".
- **Resultado da partida** (`apps/game-server/src/match-report.ts`): ao fim de cada partida com humanos o servidor manda `POST /internal/matches` (`serverMatchId` = sala + criação + nº da partida; idempotente na API) com modo, mapa, placar, datas e estatísticas por jogador (contas como `userId`). `ranked` = sala Ranked **e** mínimos de `rankingEnabled` (contas distintas ≥ `ranking_minhumans`, jogadores ≥ `ranking_minplayers`); Casual e Ranked abaixo dos mínimos mandam só estatísticas. Deltas de score/neg = 0 até o OG-084.
- **Bug do port corrigido** (achado no teste do Casual): ao entrar o 2º jogador, a sala reinicia o mundo (`ctf_game_restart`) e apagava os power-ups agendados por `addPlayer`; o original chama `check_powerup_creation(false)` no fim de `client_connected`, depois do reinício. Sem isso, uma sala Casual recém-aberta ficava sem power-ups até alguém pegar um (nunca). Corrigido em `Room.join`; a sim não mudou (paridade intacta).
- Testes: `apps/game-server/src/modes.test.ts`; claim `owner` em `apps/api/src/routes/registry.test.ts`.
