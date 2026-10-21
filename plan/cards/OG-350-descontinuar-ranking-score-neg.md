# OG-350 — Descontinuar o ranking por score/neg

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S37 |
| Status | Pronto |
| Dependências | OG-349 |
| Regras de negócio | RN-RNK-01..04, RN-TIM-01, RN-RKL-19, RN-RKL-22..24, RN-SKL-05, RN-SKL-06 (D-65, D-66) |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero desligar o ranking antigo por score/neg sem perder os dados, para que o jogo siga só com o OpenSkill e o leaderboard mensal.

## Contexto
- D-66 (2026-10-22): o ranking por score/neg é substituído pelo leaderboard de atributos (OG-352/353) e pelo rating do OpenSkill (OG-349). Os dados antigos ficam guardados.
- A temporada de outubro fecha em 1º de novembro pelo sistema antigo e é a última dele; os selos já gravados continuam.

## Escopo
- **Game server:** sai o modificador de time e o acúmulo/envio de deltas score/neg (`apps/game-server/src/ranking.ts`, `RankingDeltas`, `teamModifiers`); `scoreFrag`/`scoreNeg` continuam para o placar e as estatísticas.
- **API:** `ratings`, `format_ratings` e `season_standings` ficam no banco, só leitura, sem receber partidas; `/internal/rating-deltas` deixa de ser usado (aceita e ignora, para servidores antigos durante o deploy). Rotas e telas do ranking antigo saem (a página `/ranking` passa a ser o leaderboard, OG-353).
- **Ticket de entrada:** leva o μ do OpenSkill no lugar da força score/neg. RN-TIM-01 (desempate ao entrar) passa a usar a soma dos μ dos times.
- **Bot substituto (RN-RKL-19, OG-266):** a posição no ranking que entra no nível do bot passa a ser a posição no OpenSkill (percentil do μ − 3σ); sem rating ainda → nível intermediário, como hoje.
- **Fim da opção de não participar** (RN-SKL-06, PO em 2026-10-22: "não quer? jogue apenas Casual"): saem o interruptor nas Opções (`apps/web/src/screens/options.tsx`), as rotas `GET`/`PUT /account/ranking` e o campo `participate` do ticket; no game server, `participates()` passa a ser só humano com conta. A coluna `player_profiles.ranking_participation` fica sem uso (sem migration destrutiva). Política de privacidade (`packages/content/src/privacy.ts`) sem "participação no ranking".
- **Virada de 1º de novembro:** fecha outubro e grava o hall da fama pelo sistema antigo (último uso); a partir daí a virada só abre a temporada nova e o hall vem do OG-354.
- RNs antigas marcadas como descontinuadas no PLAN; spec `plan/specs/ranking.md` com aviso no topo.

## Critérios de aceite
- [ ] Partida ranqueada não grava mais score/neg; testes do game server e da API atualizados.
- [ ] Ticket e desempate de time usam o μ; bot substituto usa a posição no OpenSkill.
- [ ] Sem opção de não participar: Opções, rotas e ticket sem `participate`; quem tinha desligado passa a contar.
- [ ] Dados antigos intactos no banco (sem migration destrutiva).
- [ ] Virada de 1º de novembro testada: fecha outubro pelo sistema antigo.

## Notas de implementação
(preenchido durante a execução)
