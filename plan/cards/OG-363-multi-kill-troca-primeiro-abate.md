# OG-363 — Multi-kill, troca e primeiro abate no leaderboard

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S38 |
| Status | Concluído |
| Dependências | OG-362 |
| Regras de negócio | RN-LDB-02, RN-LDB-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ser reconhecido por jogadas que dependem do momento: abates em sequência rápida, vingar um aliado e abrir a disputa.

## Contexto
- Parte 2 do OG-356. Ideias trazidas pela comunidade na discussão do rating (multi-kills e trades do HLTV).

## Escopo
- Calculados a partir do registro de eventos (OG-362), por jogador e partida:
  - **multi-kill**: 2 ou mais abates do mesmo jogador em até 4 s (propor a janela ao PO na revisão);
  - **troca**: matar, em até 3 s, o inimigo que acabou de matar um aliado;
  - **primeiro abate**: o primeiro abate depois de cada renascimento geral ou captura (definir com o PO o que é "abrir a disputa" num CTF sem rounds).
- Novos stats no leaderboard, por 10 minutos jogados, com "desde DD/MM" (só partidas com eventos). Fora dos principais: o índice do mês e o hall da fama não mudam.
- Textos pt-BR e inglês.

## Critérios de aceite
- [x] Testes com sequências de eventos montadas à mão para cada stat (limites das janelas inclusive).
- [x] Leaderboard mostra os três stats com a data de início.
- [ ] PO aprova as janelas de tempo e a definição de primeiro abate.

## Notas de implementação
- Proposta ao PO: **multi-kill** = sequência de 2+ abates com até 4 s entre um e o próximo (a sequência conta 1, seja dupla ou quádrupla); **troca** = matar em até 3 s o inimigo que matou um aliado (outro que não você); **primeiro abate** = o primeiro abate da partida e o primeiro depois de cada captura. Janelas em `apps/api/src/match-moments.ts`.
- Calculados na API ao gravar a partida (dos eventos do OG-362) e somados ao `stats` de quem está nos eventos e no fim da partida; quem saiu no meio não leva. Leaderboard: 3 stats por 10 min com "desde DD/MM"; texto explicativo dos stats novos abaixo do leaderboard.
