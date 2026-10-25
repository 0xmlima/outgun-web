# OG-420 — Entrar, cadastro e conta no celular

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S45 |
| Status | Em revisão |
| Dependências | OG-418 |
| Regras de negócio | RN-UI-08 |
| Skills | `outgun-card-workflow` |

## História
Como jogador ou moderador no celular, quero entrar na minha conta, para ver meus dados e moderar.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.

## Escopo
- Entrar, cadastro, esqueci a senha e redefinir senha no layout do celular (teclado virtual sem cobrir o botão; `autocomplete` certo para o gerenciador de senhas).
- Minha conta: dados, clã, número e cores para leitura; trocar senha, trocar nome e sair. Escolha de número/cores e excluir conta também funcionam (formulários simples).
- Convites e pedidos do clã (`/clans/inbox`): aceitar e recusar.

## Critérios de aceite
- [x] Login, cadastro e recuperação de senha funcionam em 360 px.
- [x] Aceitar/recusar convite de clã no celular.

## Notas técnicas
- Só layout: as rotas e a API não mudam.

## Notas de implementação
- As telas de conta já eram formulários estreitos com `autocomplete` certo; no celular: "Jogar como convidado" some, a viewport encolhe com o teclado (`interactive-widget=resizes-content`) e `scroll-padding` deixa o campo e o botão à vista.
- Convites e pedidos do clã (`/clans/inbox`) entram no layout do OG-422.
