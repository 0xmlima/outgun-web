# OG-090 — Gravação de replays

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Backlog |
| Dependências | [OG-042](OG-042-snapshots-aoi.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero que partidas sejam gravadas para rever e compartilhar.

## Contexto e referências no original
- `record_message`, `pid_record` (`servnet.cpp`), `REPLAY_VERSION` (`protocol.h`), setting `recording`.

## Escopo
- Gravar o stream de um "espectador onisciente" (snapshots + eventos) comprimido.
- Upload para object storage ao fim da partida; metadados na API.
- Retenção configurável.

## Critérios de aceite
- [ ] Replay de 10 min com 16 jogadores ≤ 5 MB.
- [ ] Versão do formato gravada no cabeçalho.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
