# OG-042 — Snapshots por cliente e interesse por sala

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S6 |
| Status | Em andamento |
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
- [ ] Cliente não recebe posição exata de inimigos fora da sala nem de inimigos com shadow fora das regras.
- [ ] Tráfego médio < 10 KB/s por cliente com 32 jogadores.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
