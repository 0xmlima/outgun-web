# OG-353 — Página do leaderboard mensal

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S37 |
| Status | Em revisão |
| Dependências | OG-352 |
| Regras de negócio | RN-LDB-01..04, RN-SOC-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma página de leaderboard nos moldes da do HLTV, com um ranking por atributo, para ver onde eu me destaco no mês.

## Escopo
- A página `/ranking` (e o resumo na página inicial) passa a ser o leaderboard: temporada atual por padrão, seletor de mês anterior e "sempre", filtro por formato.
- Uma visão geral com os 3 primeiros de cada stat, e a lista completa ao escolher um stat.
- Cada linha: posição, jogador (com tag do clã), valor do stat na forma de ranquear e partidas no período. O jogador logado vê a própria posição em cada stat.
- Nota curta de como cada stat é calculado (por 10 min, razão, recorde), e que o dano é bruto (inclui o excesso).
- Ranking de clãs continua como está, na mesma página.
- Botão "i" do ranking antigo sai daqui (o do rating vai para o perfil, OG-351).
- Design system v2; pt-BR e inglês.

## Critérios de aceite
- [x] Mês atual, mês anterior, "sempre" e os quatro filtros de formato.
- [x] Estado vazio no começo do mês ("ninguém com 5 partidas ainda").
- [x] Acessível por teclado.

## Notas de implementação
- `/ranking` virou "Leaderboard": abas Jogadores e Clãs; período (este mês, meses anteriores, sempre), estatística (visão geral ou uma) e formato. Visão geral = um quadro por stat com os 3 primeiros e o selo "Hall da fama" nos principais; a lista mostra "Você: Nº de N" ou quantas partidas faltam.
- Tela inicial: líder do mês em cada stat principal e "Seu rating" (perfil, OG-351) no lugar do top 5 e da posição no ranking antigo.
- Saíram da API `/leaderboard` e `/leaderboard/overall` (score/neg); `/leaderboard/clans` continua. O "i" do rating não aparece mais no ranking, só no perfil e na tela inicial.
