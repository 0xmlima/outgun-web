# OG-015 — Mapas aleatórios na rotação da sala

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Concluído |
| Dependências | [OG-011](OG-011-map-generator.md) |
| Regras de negócio | RN-MAP-06, RN-VOT-04 |
| Skills | `outgun-re-spec` |

## História
Como admin de sala, quero `random_map` na rotação, para variar as partidas com mapas gerados na hora.

## Contexto e referências no original
- `src/server.cpp:514-524` (`load_rotation_map` gera `mapgen_<rand()>` a cada vez que o mapa entra).
- Download de mapa pelo cliente no original (o cliente pede o arquivo que não tem).

## Escopo
- Rotação da sala com entradas `random_map` (as settings já leem a linha; o gerador é o OG-011).
- Mandar o texto do mapa gerado aos clientes (mensagem nova no protocolo ou rota HTTP do game server); o cliente web e os bots carregam dele.
- Bloco de `mapgen/` disponível no servidor (ordem alfabética, spec mapgen.md).

## Critérios de aceite
- [x] Sala com `random_map 3 2` gera um mapa novo a cada vez que ele entra na rotação; humanos e bots jogam nele.
- [x] Votação e lista de mapas mostram `<Random>` como no original.

## Notas técnicas
- Descoberto no OG-011 (S10): o card do gerador cobre só o port; a entrega do mapa ao cliente é trabalho à parte.

## Notas de implementação
- `apps/game-server/src/generated-maps.ts`: `parseRandomMapToken` (mesma validação da linha `random_map` do gamemod, `GS_RandomMap::set`) e `GeneratedMaps` (gera com `generateRandomMap` do OG-011 e os blocos de `mapgen/` em ordem alfabética — spec mapgen.md —, nome `mapgen_<rand()>` como o `load_rotation_map`, últimos 64 textos em memória). `maps.ts`: `resolveRotation` aceita nomes e `random_map` em qualquer rotação (env, painel, sala privada, salas fixas).
- Sala: entradas `random` na rotação geram um mapa novo a cada vez que entram (como o original); a `mapList` mostra `<Random>`, autor Outgun e o tamanho pedido (`net_data_quick_map_list`); bots jogam no mesmo `GameMap`. Replay grava `mapText` no cabeçalho (`ReplayHeader.mapText`, opcional, compatível com os replays antigos).
- Game server serve `GET /maps/mapgen_<n>.txt` (e `/m/<instância>/maps/...`, OG-103); o cliente (`loadMap`) baixa mapas gerados de lá, o player de replay usa o texto embutido e o espectador baixa antes de começar.
- Divergência interna: o sorteio do mapa usa um gerador próprio do processo, não o `rand()` do mundo (no original o gerador dividia o `rand()` global); não muda a simulação da partida.
- Testes: `generated-maps.test.ts` (linha, rotação mista, mapa novo a cada entrada, `<Random>`, texto, rota HTTP com nomes inválidos); E2E começa a sala principal num `random_map 2 2` e confere que o navegador carregou o mapa.
