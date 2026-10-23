# OG-407 — Cores primária e secundária do clã

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S43 |
| Status | Pronto |
| Dependências | OG-275 |
| Regras de negócio | RN-CLA-09, D-78 |
| Skills | `outgun-card-workflow` |

## História
Como líder de clã, quero escolher a cor primária e a secundária do meu clã, para que o time do clã jogue com as nossas cores.

## Contexto
- Pedido do PO em 2026-10-23 (S43): "um anseio muito antigo da comunidade" — personalização no jogo.
- A cor só aparece na partida pelo OG-408/409; aqui é o cadastro.

## Escopo
- Página do clã (líder e admins do clã): cor primária e secundária escolhidas numa paleta curada (cores de time legíveis sobre os fundos dos temas), com prévia do boneco e da bandeira.
- Recusa cor parecida demais (diferença percebida, não igualdade) com o vermelho e o azul padrão do lado oposto e primária igual à secundária.
- API: campos no clã, auditoria da troca; perfil público do clã mostra as cores.

## Critérios de aceite
- [ ] Líder escolhe primária e secundária; membro comum não edita.
- [ ] Cor parecida com o vermelho ou o azul padrão, ou primária = secundária, é recusada com mensagem (teste).

## Notas de implementação
