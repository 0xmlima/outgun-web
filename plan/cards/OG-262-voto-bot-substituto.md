# OG-262 — Desconexão permanente: voto entre jogar com um a menos ou bot substituto

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S20 |
| Status | Pronto |
| Dependências | [OG-261](OG-261-pausa-desconexao.md) |
| Regras de negócio | RN-RKL-18, RN-RKL-19, RN-MOD-06 |
| Skills | `outgun-card-workflow` |

## História
Como time que perdeu um jogador, quero decidir se seguimos com um a menos ou com um bot no lugar, para terminar a partida da forma mais justa possível.

## Escopo
- Com a desconexão permanente, o jogo continua pausado e abre um voto **só do time desfalcado**, por 20 s: "Seguir com um a menos" ou "Bot no lugar". Maioria decide; empate ou ninguém vota = bot (D-46).
- Bot substituto: entra no time e no lugar do jogador que saiu, com o nome **`BOT-<nome>`** (ex.: `BOT-ozzylords`) e o nível do OG-266; **no máximo 2 bots por partida** (somando os dois times). Esgotado o limite, só "seguir com um a menos".
- É a **única** forma de bot no Ranked: comandos e `bots_fill` continuam recusados (revisa D-11).
- Se o jogador original reconectar depois, retoma a vaga (time e frags do bot somam aos dele, a definir na implementação) e o bot sai; isso pausa e retoma com os 3 s.
- Em série, o bot não passa para o próximo jogo: a vaga reabre no lobby (D-43).

## Critérios de aceite
- [ ] Testes: voto "bot" adiciona o bot; 3ª desconexão não oferece bot; voto "um a menos" retoma sem bot.
- [ ] Nenhum outro caminho adiciona bot no Ranked (testes dos comandos recusados continuam passando).

## Notas técnicas
- Usa o `BotClient` do OG-053. Até o OG-266, o bot entra no nível atual (único).
- `BOT-` + nome passa de `MAX_NAME_LENGTH` (15) quando o nome tem mais de 11 caracteres: o nome do bot é gerado pelo servidor e não passa pelo `checkName`; o HUD tem de caber os 19 caracteres (conferir no `pnpm visual:check`, RN-UI-05). O bot também mostra a clan tag do jogador (OG-206).

## Notas de implementação
(preenchido durante a execução)
