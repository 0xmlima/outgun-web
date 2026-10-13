# OG-064 — Predição, reconciliação e interpolação

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S7 |
| Status | Em revisão |
| Dependências | [OG-042](OG-042-snapshots-aoi.md), [OG-043](OG-043-client-input.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero que minha nave responda imediatamente aos comandos mesmo com 100 ms de latência.

## Contexto e referências no original
- `ClientWorld::extrapolate`, `extrapolateSinglePlayerPosition` (`world.cpp:3697-3750`).
- `ClientBase::process_live_frame_data` (`clientbase.cpp:419`): histórico de 256 controles, `averageLag`, ajuste de offset de envio.
- Opção de "aumentar lag" (handicap) do original.

## Escopo
- Predição do próprio jogador com `packages/sim` e reconciliação com o snapshot.
- Interpolação de entidades remotas (render a 60+ fps entre frames de 10 Hz).
- Sincronização de relógio e ajuste de envio.
- Handicap de lag opcional.

## Critérios de aceite
- [x] Com 150 ms de RTT e 2% de perda (simulados), sem "teleportes" perceptíveis em movimento normal.
- [x] Correções de predição < 1 por segundo em média em teste automatizado.

## Notas técnicas
- —

## Notas de implementação
- Spec: [plan/specs/predicao-interpolacao.md](../specs/predicao-interpolacao.md). Decisão D-18 (PLAN seção 12).
- **`packages/netcode`** (novo, puro como a sim): `ClientSession` guarda o último frame (`fx`), cria e avança os foguetes a partir de `rocketFire`/`rocketVisible` (`rocketFrameAdvance`, formação compartilhada com o servidor em `packages/sim/src/world/rockets.ts`), envia os controles a 10 Hz com histórico de 256, `averageLag` e ajuste de envio pelo `frameOffset`, reenvio no meio do frame, e `extrapolate(agora)` faz o `ClientWorld::extrapolate` do original (próprio jogador previsto, os outros com os últimos controles). `SimulatedLink`: rede simulada com atraso, jitter e perda com retransmissão em ordem (TCP).
- **Divergências** (D-18): predição ligada por padrão; relógio estimado do servidor em vez do tempo desde o último frame; frames inteiros na extrapolação; troca de sala liberada para o jogador previsto; suavização das correções (meia-vida 80 ms, sem suavizar saltos > 48 px). A "interpolação" de entidades remotas do escopo virou extrapolação suavizada, como o original: interpolar no passado mostraria inimigos ~100 ms atrasados e pioraria a mira.
- **Handicap de lag**: opções "Previsão de atraso" e "Quantidade de previsão de atraso" (0..10) do original em Opções (`lagWanted = 2·(1 − quantidade/10)`).
- **Servidor**: `frameOffset` medido de verdade (antes ia 0); `flagUpdate` a cada mudança de bandeira, como `ctf_net_flag_status` (lacuna do OG-042: sem isso o cliente não sabia quem carrega a bandeira, e a predição de quem corre com a bandeira inimiga errava ~0,8 px por frame); `mapChange` com o nome do arquivo; porta padrão 7700 (a 7000 é do AirPlay no macOS).
- **Cliente web**: `/play` joga no servidor (`server`, `sala`, `name`, `lag`, `loss`); demo em `/play?demo=N`. `world-view.ts` converte o mundo (demo ou extrapolado) para o renderer.
- **Resultados**: `apps/game-server/src/prediction.test.ts` (servidor real + 4 clientes, 60 s, 150 ms ±20 ms, 2% de perda): 0,10–0,20 correções/s, 0 teleportes, maior excesso de deslocamento entre quadros 4,4 px; sem latência, 0 correções. No navegador (`tools/visual-compare/online.mjs`): a nave responde em 8–60 ms com 150 ms de RTT (sem predição: 205–310 ms), 0,05–0,35 correções/s, foguetes simulados no cliente. Prints em `tools/parity/out/prints/og064-*.png`.
- Fica para outros cards: ping no frame e no placar (OG-065/066), nomes/cores pessoais (OG-068), arquivo de mapa que o cliente não tem (download pelo CRC, OG-045).
