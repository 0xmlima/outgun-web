# OG-508 — App desktop: tela inicial sem o botão "Sair do Outgun"

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-444 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador no app da Steam, quero fechar o jogo pelo menu principal, sem procurar o botão em outra tela.

## Contexto
- Achado do PO (2026-10-29, 2.53.0, app da Steam): não achou o "Sair" no menu principal.
- O OG-444 pôs o "Sair do Outgun" só na barra de cima (`TopBar` em `app/Shell.tsx:158`). A tela inicial do computador (`/`) monta o próprio topo e esconde a `TopBar` (`Shell.tsx:198`), então o botão só aparece nas telas internas. No Windows o app abre em tela cheia, sem o X da janela.

## Escopo
- "Sair do Outgun" na tela inicial do app desktop (só no desktop, como hoje), visível sem rolar; mesma ação `quitDesktop`.

## Critérios de aceite
- [ ] O botão aparece na tela inicial do app e fecha o jogo.
- [ ] Não aparece no navegador.
- [ ] PO confere no app da Steam.

## Notas de implementação
