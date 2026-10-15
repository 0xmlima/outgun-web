# OG-253 — Times no lobby: clãs do mesmo lado e troca de lado

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S17 |
| Status | Pronto |
| Dependências | [OG-252](OG-252-salas-lobby-ranked.md), [OG-270](OG-270-clas-cadastro-api.md) |
| Regras de negócio | RN-RKL-08, RN-RKL-09 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de um clã, quero cair no mesmo time dos meus companheiros de clã e poder trocar de lado, para jogar com quem eu combinei.

## Contexto
- Clã = clã cadastrado do jogador (OG-270), comparado pelo id do clã, não pelo texto da tag. RN-TIM-01/02 regem a entrada e a troca dentro da partida.

## Escopo
- Ao entrar no lobby: vai para o lado onde há mais jogadores do mesmo clã (com vaga); sem clã ou empate, RN-TIM-01.
- Troca de lado no lobby: move se o outro lado tem vaga; lado cheio → pedido de troca que o outro jogador aceita (troca os dois).
- Durante a contagem (OG-254), qualquer troca cancela a contagem.

## Critérios de aceite
- [ ] Testes: 3 jogadores do clã "nn" entrando intercalados com outros terminam do mesmo lado quando há vaga.
- [ ] Troca com lado cheio só acontece com aceite.

## Notas técnicas
- Jogador sem clã não é agrupado com ninguém.

## Notas de implementação
(preenchido durante a execução)
