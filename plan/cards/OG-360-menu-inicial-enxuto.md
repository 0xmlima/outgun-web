# OG-360 — Menu inicial enxuto (opções no menu superior)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S37 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-UI-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero um menu inicial limpo, sem repetir o que já está na barra do topo.

## Contexto
- Pedido do PO (2026-10-22): o menu inicial estava poluído.

## Escopo
- Saem do menu inicial: Ranking, Jogadores e Replays (já no topo); Clãs, Opções e Ajuda (vão para o topo); Créditos e Enviar feedback (ocultos por ora; as rotas continuam); Conta/Entrar (o nome à direita leva à conta; "Entrar" já está no topo).
- Ficam: Jogar agora, Salas, Criar sala privada, Meu perfil, Jogar no computador e Moderação (para quem modera).
- Barra superior: Salas, Ranking, Jogadores, Clãs (o meu clã ou o diretório), Replays, Opções, Ajuda.

## Critérios de aceite
- [x] Menu inicial e barra superior como no escopo.

## Notas de implementação
- O contador de convites que ficava no item Clãs passou para o sino das notificações (OG-361).
