# OG-355 — Contadores novos: dano efetivo, abates por zona e defesas

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
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

## Critérios de aceite
- [ ] Testes da sim para cada contador; resultado da partida e relatório com os campos novos.
- [ ] Leaderboard mostra a data de início dos stats novos.

## Notas de implementação
(preenchido durante a execução)
