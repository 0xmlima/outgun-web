# OG-390 — Marcos novos a partir dos stats da partida (vitórias, tempo, bandeira, defesa, combate)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S41 |
| Status | Concluído |
| Dependências | OG-355, OG-364 |
| Regras de negócio | RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero marcos para tudo o que faço bem numa partida (vencer, defender, levar a bandeira, encadear kills), para ter metas além de partidas, kills e capturas.

## Contexto
- Pedido do PO em 2026-10-23 (S41): o catálogo do OG-213 tem 20 marcos e não usa nenhum stat novo do OG-355/OG-363 (`match_players.stats`).
- Stats disponíveis: `assists`, `defenses`, `flagsTaken`, `flagsReturned`, `flagCarryingTime`, `carriersKilled`, `consecutiveKills`, `killsOwnBase/Midfield/EnemyBase`, `effectiveDamage`, `multiKills`, `trades`, `firstKills`, `shots`, `hits`, além de `deaths` e `play_seconds`. Gravados desde a S38 (Casual e Ranked).

## Escopo
- `MilestoneMatch` ganha `deaths`, `playSeconds` e `stats` (o jsonb inteiro, kills em bot já descontados); a consulta de `apps/api/src/milestones.ts` passa a lê-los.
- Marcos novos (id estável · nome pt/en · condição). Limites são do catálogo, num só lugar:
  - `wins_1` Primeira vitória / First win · 1 vitória; `wins_100` Vencedor / Winner · 100; `wins_500` Campeão / Champion · 500.
  - `hours_10` Dedicado / Dedicated · 10 h jogadas; `hours_100` Incansável / Tireless · 100 h.
  - `hat_trick` Hat-trick · 3 capturas numa partida; `captures_250` Mestre das bandeiras / Flag master · 250 capturas; `returns_100` Resgatador / Rescuer · 100 bandeiras devolvidas; `carry_60` Maratonista / Marathoner · 60 s com a bandeira numa partida.
  - `defenses_match_10` Muralha / Wall · 10 defesas numa partida; `defenses_250` Guardião / Guardian · 250 defesas; `carriers_match_5` Caça-portador / Carrier hunter · 5 portadores mortos numa partida; `shutout` Sem chance / No chance · venceu sem sofrer captura (qualquer partida).
  - `streak_10` Em chamas / On fire · 10 kills sem morrer; `streak_20` Imparável / Unstoppable force · 20; `kills_match_30` Massacre · 30 kills numa partida; `flawless` Intocável / Untouchable · 10+ kills e 0 mortes; `accuracy_70` Atirador de elite / Marksman · 70% de precisão (mínimo de 30 tiros).
  - `multi_kill` Dobradinha / Double kill · primeiro multi-kill; `trades_50` Vingador / Avenger · 50 trocas; `first_kills_50` Abre-alas / Opener · 50 primeiros abates; `assists_100` Parceiro / Partner · 100 assistências; `enemy_base_kills_100` Invasor / Invader · 100 kills na base inimiga.
- Cada marco ganha um **grupo** (`progress`, `flag`, `defense`, `combat`, `ranked`, `social`, `clan`, `humor`, `secret`) e, nos de total, o **alvo** e o campo somado, para o OG-393 mostrar progresso.
- Retroativo: `cli.js milestones` depois do deploy (partidas sem o stat contam 0).

## Critérios de aceite
- [x] Testes de `milestonesFrom` cobrem cada marco novo no limite exato (ex.: 9 → nada, 10 → concede) e a partida da conquista.
- [x] Os 20 ids antigos não mudam; o retroativo é idempotente.

## Notas técnicas
- Nada de stat novo no game server: tudo já está no jsonb.

## Notas de implementação
- Catálogo ganhou `group` (seções do OG-393) e `MILESTONE_TOTALS` (contador + alvo, para o progresso). Imbatível foi para Progresso.
- Feitos de kills numa partida (Em chamas, Imparável, Massacre, Intocável) só valem em partida sem kills em bots: o `consecutiveKills` do jsonb não separa bots.
- Sem chance usa o placar sofrido de qualquer partida (`conceded`); partida sem o campo não concede.
- Pendente: rodar `cli.js milestones` no beta depois do deploy.
