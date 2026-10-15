# OG-261 — Pausa automática quando um jogador cai no Ranked

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S20 |
| Status | Backlog |
| Dependências | [OG-260](OG-260-pausa-tatica.md) |
| Regras de negócio | RN-RKL-17 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de Ranked, quero que o jogo pause sozinho se alguém cair, para que a queda de conexão não decida a partida.

## Contexto
- OG-047: reconexão com token por `reconnectSeconds` (15 s), o jogador fica parado no mundo.

## Escopo
- No Ranked, a queda de um jogador pausa o jogo na hora; **não** gasta o saldo de pausa do time.
- O jogador volta ao mesmo lugar (time, posição, bandeira, frags) pela reconexão do OG-047; a espera no Ranked é de **120 s** (D-46).
- Ao voltar, retomada com a contagem de 3 s; se não voltar no prazo, é desconexão permanente (OG-262).
- Duas quedas ao mesmo tempo: um só congelamento, cada jogador com o seu prazo.

## Critérios de aceite
- [ ] Testes: queda pausa, reconexão retoma, prazo esgotado dispara o OG-262.
- [ ] Saída voluntária (botão "Sair") também conta como desconexão permanente, sem esperar o prazo.

## Notas de implementação
(preenchido durante a execução)
