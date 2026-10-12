# OG-042 — Snapshots por cliente e interesse por sala

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S6 |
| Status | Em revisão |
| Dependências | [OG-040](OG-040-game-server-core.md), [OG-041](OG-041-binary-protocol.md) |
| Regras de negócio | RN-VIS-01, RN-VIS-02, RN-VIS-03 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero receber só o que posso ver, para que o jogo seja leve e justo (sem ver inimigos com shadow).

## Contexto e referências no original
- `ServerNetworking::broadcast_frame` (`servnet.cpp:1937-2345`).
- `seesPropertiesRemotely`, `doesPlayerSeeRocket`, `writeMinimapPlayerPosition`.

## Escopo
- Snapshot por cliente: frame, eco de input, jogadores da sala, minimapa com rotação (`minimap_send_limit`), vida/energia próprias, propriedades remotas.
- Eventos de visibilidade de power-ups e foguetes por sala.
- Medição de bytes por cliente.

## Critérios de aceite
- [x] Cliente não recebe posição exata de inimigos fora da sala nem de inimigos com shadow fora das regras.
- [x] Tráfego médio < 10 KB/s por cliente com 32 jogadores.

## Notas técnicas
- —

## Notas de implementação
- **Spec:** [`plan/specs/snapshots-aoi.md`](../specs/snapshots-aoi.md): `broadcast_frame`, `doesPlayerSeeRocket`, `game_player_screen_change`, eventos de power-up e foguete por sala.
- **`apps/game-server/src/aoi.ts` (puro, testável):**
  - `minimapViews`: o que cada time vê no minimapa, sem e com shadow (aliados; inimigos na sala de um aliado vivo com `visibility > 10` ou bandeira; `always_send_flag_location`; portadores; `shadow_see_shadow`);
  - `buildFrame`: jogadores da mesma sala (inimigo com shadow total só com bandeira ou com `shadow_see_shadow`; spawn protegido pisca 128/220; morto sem controles), minimapa em rodízio limitado por `min(minimap_send_limit, banda do cliente)` (padrão 2, mensagem `minimapBandwidth`), propriedades remotas que mudaram (`minimapProperties`) conforme `see_minimap_player_properties`, vida e energia próprias;
  - `seesRocket` (distância de salas com volta ≤ `see_rockets_distance`) e `minimapPosition`.
- **Sim (`@outgun/sim`):** novos hooks opcionais `rocketsFired`, `rocketRemoved`, `powerupAppeared`, `powerupPicked`, `playerScreenChange` (só avisam; paridade igual: 40/44 idênticos + 4 externos).
- **`Room`:** frame por destinatário via `buildFrame`; eventos só para quem vê, enviados no mesmo pacote do próximo frame: tiro para quem vê a sala, com a lista de quem conhece cada foguete (`vislist`); remoção para essa lista; ao trocar de sala ou renascer, os power-ups da sala e os foguetes que passa a ver (`rocketVisible`); power-up que aparece ou é pego, para quem está na sala. Wall hits não geram mensagem (o cliente simula, como no original).
- **Medição de bytes:** por cliente na `Room` (`traffic()`) e em `/metrics` (`outgun_client_bytes_per_second_avg`).
- **Critérios:**
  1. testes de visibilidade (`aoi.test.ts`): só a mesma sala, shadow, bandeira, mortos, minimapa e rodízio. Sala com 32 jogadores por 60 s de jogo: a cada frame, o jogador 0 só recebe jogadores da sala dele e só tiros saídos da sala dele;
  2. **tráfego médio 4,39 KB/s por cliente** (máximo 4,77 KB/s) com 32 jogadores andando e atirando (meta: < 10 KB/s).
- **Divergências (D-16):** minimapa como lista de pids, rodízio sem arredondar para múltiplos de 4, sem o código 252 no `rocketDelete`.
- **Provisório:** `frameOffset` vai 0 e o ping do rodízio vai vazio até a medição de ping (OG-047); a predição que usa esses campos é do OG-064.
- Branch: `og-042-snapshots-aoi` (empilhada sobre `og-063-input`).
