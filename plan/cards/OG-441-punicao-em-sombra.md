# OG-441 — Punição em sombra: suspeito confirmado joga separado

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-439, OG-053 |
| Regras de negócio | RN-PLT-05, RN-BOT-02 |
| Skills | `outgun-card-workflow` |

## História
Como operador, quero que o trapaceiro confirmado continue jogando sem atrapalhar ninguém, para que ele não perceba o ban e volte com outra conta.

## Contexto
- Saído do OG-439: o ban avisa o trapaceiro, que cria outra conta. Na sombra, a conta só cai em salas com bots (OG-053) e a partida não conta para nada público.
- Tem custo de produto: sombra é punição sem aviso nem recurso, e o jogador pode perceber (chat vazio, amigos que não aparecem, clã, séries).

## Escopo
- Degrau "sombra" no histórico do OG-439, aplicado só por moderador, com motivo e prazo, registrado em `admin_actions`.
- No join, a conta em sombra cai numa sala Casual só com bots, com os mapas da rotação; nunca em sala Ranqueada, privada ou de clã.
- A partida não entra em ranking, perfil público, marcos, medalhas nem relatório público.
- Nada da sombra aparece em API pública (perfil, ranking, histórico, lista de salas).

## Critérios de aceite
- [ ] Conta em sombra entra numa sala Casual com bots; nenhuma conta normal cai nessa sala.
- [ ] A partida não conta para ranking, perfil nem marcos; nenhuma rota pública revela a sombra (teste de API).
- [ ] Sombra expira no prazo e a conta volta às salas normais.

## Notas técnicas
- Sala própria (`roomId` privado com bots) ou flag na conta que faz o join escolher uma sala assim (`apps/api/src/routes/join.ts`, `rooms.ts`); decidir no refinamento.
- **Decisão do PO antes do Pronto (D-NN):** usar sombra ou não; se sim, se ela entra nos termos e se cabe recurso.

## Notas de implementação
—
