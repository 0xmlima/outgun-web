# OG-361 — Notificações: sino no topo e aviso (toast) das não lidas

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S37 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-CLA-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver quando alguém me convida para um clã (ou pede para entrar no meu), sem precisar abrir a página de clãs.

## Contexto
- Pedido do PO (2026-10-22): o convite ficava escondido no menu de clãs.

## Escopo
- API: tabela `notifications` (migration 0031); convite de clã avisa o convidado, pedido de entrada avisa líder e admins do clã. `GET /notifications` (30 mais recentes e as não lidas), `POST /notifications/:id/read`, `POST /notifications/read-all`.
- Site: sino ao lado do nome, no topo, com o número de não lidas e a lista (clicar leva à caixa de convites ou à página do clã e marca como lida; "Marcar todas como lidas").
- Cada não lida aparece como aviso fixo à direita (toast que não some sozinho); fechar o aviso marca a notificação como lida. Relê a cada 30 s com a aba visível. Só fora da partida.
- pt-BR e inglês; inventário de privacidade.

## Critérios de aceite
- [x] Testes da API: convite, pedido, ler uma, ler todas, só as próprias.
- [x] Fechar o aviso marca como lida.

## Notas de implementação
- O aviso aparece uma vez por sessão para cada notificação; se a pessoa não fechar, ela continua não lida no sino.
- Outros tipos de notificação (fim de série, marco) podem entrar depois só com um `kind` novo.
