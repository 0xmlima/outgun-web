# OG-252 — Salas de lobby Ranked: criar, listar e entrar (com senha opcional)

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S17 |
| Status | Pronto |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md) |
| Regras de negócio | RN-RKL-05, RN-RKL-06, RN-RKL-07, RN-MOD-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de Ranked, quero ver as salas abertas e entrar num lobby antes da partida, para só jogar quando o time estiver completo.

## Contexto
- Hoje "Ranked" leva direto à partida (quick-join, `apps/api/src/routes/join.ts`); sala privada só existe no Casual (RN-CFG-03).

## Escopo
- Game server: sala Ranked ganha fases `lobby → voto → prontos → contagem → jogo → (próximo jogo da série: voto) → fim`; no `lobby` ninguém entra no mapa.
- A partida só começa com a sala completa (2 × N jogadores com conta, D-40). Quem sai no lobby libera a vaga.
- API: criar sala Ranked (formato, série, senha opcional ≤ 15 caracteres, regras travadas); lista de salas Ranked abertas com formato, série, ocupação, fase, cadeado e região; entrar exige conta e a senha, quando houver.
- Sala vazia no lobby é fechada após um tempo; sala em jogo não aceita entradas novas (só entre jogos da série, se houver vaga — D-43).

## Critérios de aceite
- [ ] Com 5 de 6 jogadores num 3x3, ninguém entra no mapa.
- [ ] Senha errada é recusada sem revelar nada da sala; convidado é recusado (RN-MOD-03).
- [ ] Testes das transições de fase e de entrada/saída no lobby.

## Notas técnicas
- Revisa RN-MOD-04 e RN-CFG-03: Ranked passa a ter senha, mas as regras continuam travadas (D-44).
- O estado do lobby trafega pelo mesmo WebSocket da sala (mensagens novas em `packages/protocol`).

## Notas de implementação
(preenchido durante a execução)
