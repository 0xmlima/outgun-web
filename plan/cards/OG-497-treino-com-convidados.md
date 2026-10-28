# OG-497 — Treino com convidados: escolher o lado, junto ou contra

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-490, OG-492 |
| Regras de negócio | RN-TRN-05, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero chamar amigos para a sala de treino, treinando do meu lado ou fazendo o papel do outro lado.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- P7: dá para convidar mais participantes; eles escolhem o lado, para treinar junto ou em lados opostos.

## Escopo
- Convite e senha como em qualquer sala privada. Ao entrar, o convidado escolhe o lado: **treino** (o lado que faz o fundamento) ou **oposto** (assume a vaga de um bot do outro lado).
- Humano no lado oposto substitui um bot do papel; sai da sala, o bot volta na próxima tentativa.
- Fim da tentativa por morte: só quando todos os humanos do lado de treino morreram. Morte no lado oposto segue a regra do modo para bots.
- Vagas da sala: total de bots dos papéis + humanos do lado de treino (bots não ocupam vaga, OG-445).

## Critérios de aceite
- [ ] Dois humanos treinando juntos e um humano em cada lado, nos quatro modos.

## Notas técnicas
- Interpretação a confirmar na revisão: humano no lado oposto conta como o bot que ele substituiu (ex.: defensor no Ataque, atacante na Defesa).

## Notas de implementação
