# OG-412 — Notificações atrás do tocador de música

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S43 |
| Status | Pronto |
| Dependências | OG-361 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que a lista de notificações e os avisos fiquem sempre por cima de tudo, para conseguir lê-los e clicar neles.

## Contexto
- Achado do PO em 2026-10-23 (captura na tela inicial, 2.42.0): ao abrir o sino, o painel "Notificações" fica atrás do tocador da trilha sonora ("Trilha sonora · Stranger Dreams") e de outros painéis da coluna da direita.
- O painel do sino (`.app-bell-panel`, `apps/web/src/app/shell.css`) tem `z-index: 20`, mas fica dentro do contexto de empilhamento do topo; o tocador cria o seu, mais alto. Os avisos (`.ui-toasts`, `z-index: 10`) têm o mesmo risco.

## Escopo
- Camadas da interface em tokens (`--layer-*` em `apps/web/src/ui/`): conteúdo < tocador < menus e painéis do topo < avisos; o sino e os avisos sempre por cima de tudo, inclusive do tocador e dos modais.
- Conferir nas telas com o tocador aberto (início, salas, perfil, moderação) e no cliente desktop.

## Critérios de aceite
- [ ] Painel do sino por cima do tocador e de todos os painéis, em qualquer tela.
- [ ] Avisos (toasts) por cima do tocador.

## Notas de implementação
