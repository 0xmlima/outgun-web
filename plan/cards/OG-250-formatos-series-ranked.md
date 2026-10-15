# OG-250 — Formatos 3x3/4x4/5x5 e séries md1/md3/md5 no Ranked

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S16 |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | RN-RKL-01, RN-RKL-02, RN-RKL-03, RN-MOD-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de Ranked, quero escolher partidas 3x3, 4x4 ou 5x5 em melhor de 1, 3 ou 5, para jogar no tamanho e no formato de disputa combinados com os outros.

## Contexto
- Hoje há um único preset Ranked travado (`packages/settings/src/presets.ts`); a sala tem tamanho e mapas da rotação oficial.
- "3x3" = 6 jogadores com conta, sem bots (RN-MOD-06).

## Escopo
- Formato (`3x3`, `4x4`, `5x5`) e série (`md1`, `md3`, `md5`) como atributos da sala Ranked, sobre o mesmo preset travado (regras de jogo inalteradas).
- Modelo de dados: `matches.format`, tabela `ranked_series` (formato, melhor de N, placar da série, vencedor) e `matches.series_id`/`game_no`; migration + OpenAPI.
- Game server: tamanho máximo da sala = 2 × N; série termina quando um time vence ⌈N/2⌉ jogos.
- Resultado gravado por jogo (ranking por jogo, D-41) e a série fechada ao fim.

## Critérios de aceite
- [ ] Testes: série md3 termina em 2-0 e 2-1; md5 em 3-x; md1 = um jogo.
- [ ] Partidas antigas ficam sem formato (não quebram perfil, relatório nem ranking).
- [ ] Nenhum setting de jogo pode ser alterado (RN-MOD-04 continua).

## Notas técnicas
- Empate num jogo da série (se possível pelas regras de fim de partida): decidir na D-41.

## Notas de implementação
(preenchido durante a execução)
