# OG-427 — Moderação no celular

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S45 |
| Status | Pronto |
| Dependências | OG-418, OG-420 |
| Regras de negócio | RN-UI-08, D-70, D-80 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero atender denúncias e punir pelo celular, para agir rápido quando não estou no computador.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.
- Decisão do PO (2026-10-25): no celular, só as abas de moderação. `AdminScreen.tsx` (OG-087, OG-388, OG-389) tem 15 abas.

## Escopo
- No celular, o painel abre com as abas: Salas, Denúncias, Clãs, Bans, Auditoria e Feedback, com as mesmas permissões por papel.
- Mapas, Presets, Rotações, Bots, Papéis, Convites e Rede ficam só no computador: a aba some no celular e o link direto mostra "disponível só no computador".
- Ações no toque: abrir denúncia com o contexto (chat e partida), banir/silenciar com duração, desfazer ban, moderar clã, ver auditoria e responder feedback; confirmação em diálogo de tela cheia.
- Salas: ver as salas ao vivo e os jogadores; expulsar e encerrar (sem assistir).

## Critérios de aceite
- [ ] Moderador faz o ciclo denúncia → ban → auditoria em 360 px.
- [ ] As abas pesadas não aparecem no celular e o link direto mostra o aviso.
- [ ] Permissões por papel iguais às do desktop (teste).

## Notas técnicas
- `AdminScreen.tsx` tem 1743 linhas: separar as seis abas em arquivos só se ajudar o layout, sem mudar a API.
- Lista de abas permitidas no celular junto da lista de rotas do portal (OG-417).

## Notas de implementação
(preenchido durante a execução)
