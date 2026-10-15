# OG-262 — Desconexão permanente: voto entre jogar com um a menos ou bot substituto

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S18 |
| Status | Backlog |
| Dependências | [OG-261](OG-261-pausa-desconexao.md) |
| Regras de negócio | RN-RKL-18, RN-RKL-19, RN-MOD-06 |
| Skills | `outgun-card-workflow` |

## História
Como time que perdeu um jogador, quero decidir se seguimos com um a menos ou com um bot no lugar, para terminar a partida da forma mais justa possível.

## Escopo
- Com a desconexão permanente, o jogo continua pausado e abre um voto: "Seguir com um a menos" ou "Bot no lugar" (quem vota, prazo e empate: D-46).
- Bot substituto: entra no time e no lugar do jogador que saiu; **no máximo 2 bots por partida** (somando os dois times). Esgotado o limite, só "seguir com um a menos".
- É a **única** forma de bot no Ranked: comandos e `bots_fill` continuam recusados (revisa D-11).
- Se o jogador original reconectar depois, retoma a vaga e o bot sai (D-46).
- Em série, o bot não passa para o próximo jogo: a vaga reabre no lobby (D-43).

## Critérios de aceite
- [ ] Testes: voto "bot" adiciona o bot; 3ª desconexão não oferece bot; voto "um a menos" retoma sem bot.
- [ ] Nenhum outro caminho adiciona bot no Ranked (testes dos comandos recusados continuam passando).

## Notas técnicas
- Usa o `BotClient` do OG-053; o bot entra com o nível de dificuldade definido na D-46.

## Notas de implementação
(preenchido durante a execução)
