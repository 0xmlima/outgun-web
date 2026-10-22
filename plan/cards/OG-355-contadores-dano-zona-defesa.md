# OG-355 — Contadores novos: dano efetivo, abates por zona e defesas

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S38 |
| Status | Em revisão |
| Dependências | OG-352 |
| Regras de negócio | RN-LDB-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero stats que mostrem o dano que eu realmente causei e onde eu jogo (ataque, defesa), para que o leaderboard reconheça mais estilos de jogo.

## Escopo
- Sim (`packages/sim`, mudança registrada numa D-NN): novos contadores em `PlayerStats`/`PlayerResult`:
  - dano efetivo: soma de `min(dano, vida antes do acerto)` em inimigos;
  - abates por zona da vítima: base inimiga, própria base, meio ("base" = sala onde nasce a bandeira do time);
  - defesas: abates com bônus de defesa de portador e de bandeira, que hoje só somam nos frags.
- Leaderboard: os novos stats com a marca "desde DD/MM" (só partidas a partir da implantação).

## Notas técnicas
- Pontos de partida na sim: `damagePlayer` (`packages/sim/src/world/server.ts`) já calcula `carrierDefended`/`flagDefended` e passa ao hook `kill`; o dano chega em `damage` e a vida antes do acerto está em `t.health`.
- "Base" de cada time: a sala onde a bandeira do time nasce (posição inicial das bandeiras do mapa); mapas com mais de uma bandeira por time contam qualquer uma delas.
- Leaderboard: os stats novos entram em `LEADERBOARD_STATS` (`apps/api/src/leaderboard.ts`), fora dos principais (o índice do mês e o hall da fama não mudam); a data de início sai da primeira partida com o campo.

## Critérios de aceite
- [x] Testes da sim para cada contador; resultado da partida e relatório com os campos novos.
- [x] Leaderboard mostra a data de início dos stats novos.

## Notas de implementação
- Mudança da sim registrada na D-68; os campos novos vão no `stats` do relatório (já era o `PlayerResult` inteiro), sem migration.
- Leaderboard: 5 stats novos por 10 min (`effectiveDamage`, `killsEnemyBase`, `killsOwnBase`, `killsMidfield`, `defenses`); cada um só soma partidas que têm o campo (tempo jogado inclusive), e `since` = primeira ranqueada com ele.
- Relatório da partida: 5 colunas novas, com "—" nas partidas antigas. A F4 (HUD) não mudou.
- Pendente: abates em bots entram nas zonas (não há `botKills` por zona); revisar se o PO quiser.
