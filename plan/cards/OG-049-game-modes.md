# OG-049 — Modos de jogo: Casual e Ranked

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S9 |
| Status | Backlog |
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
- [ ] Em sala Ranked nenhum power-up aparece, nem no spawn nem ao morrer, em 10 minutos de partida simulada.
- [ ] Convidado recebe recusa clara ao tentar entrar em Ranked; conta logada entra.
- [ ] `/set` e alterações do dono são recusados em Ranked e funcionam em Casual (salas privadas).
- [ ] Partida Casual não altera o ranking; partida Ranked que cumpre os mínimos altera.
- [ ] Lobby e registro de salas exibem/filtram o modo.
- [ ] Sala Ranked nunca tem bots, mesmo com poucos jogadores ou comando de admin; sala Casual adiciona bots como no original.

## Notas técnicas
- A simulação não muda: Ranked é só um preset. Os golden traces do original continuam valendo; o cenário `bots-match` com `gamemod pups_max 0` pode servir de trace do Ranked se for preciso.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
