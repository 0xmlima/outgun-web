# OG-271 — Clãs: convites e pedidos de entrada

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S16 |
| Status | Pronto |
| Dependências | [OG-270](OG-270-clas-cadastro-api.md) |
| Regras de negócio | RN-CLA-03, RN-CLA-04 |
| Skills | `outgun-card-workflow` |

## História
Como admin de um clã, quero convidar jogadores; como jogador, quero pedir para entrar num clã — para o clã crescer só com quem os dois lados aceitam.

## Escopo
- Convite: líder/admin convida uma conta; o jogador aceita ou recusa. Pedido: o jogador pede; líder/admin aprova ou recusa.
- Convites e pedidos expiram em 7 dias; um pedido aberto por jogador por vez; aceitar entrada cancela os outros convites/pedidos dele.
- Carência de **7 dias** para entrar em outro clã depois de sair ou ser expulso (D-47); dissolução do clã não gera carência.
- Avisos no cliente: contador no menu e lista de convites/pedidos pendentes (sem e-mail).

## Critérios de aceite
- [ ] Testes: convite aceito/recusado/expirado; pedido aprovado/recusado; carência respeitada; jogador já em clã não pode aceitar convite sem sair antes.
- [ ] Limite de 30 membros respeitado (convite e aprovação recusados com o clã cheio).

## Notas de implementação
(preenchido durante a execução)
