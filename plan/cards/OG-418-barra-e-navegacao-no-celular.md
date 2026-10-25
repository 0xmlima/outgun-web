# OG-418 — Barra de cima, navegação e base responsiva no celular

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S45 |
| Status | Em revisão |
| Dependências | OG-417 |
| Regras de negócio | RN-UI-01, RN-UI-03, RN-UI-08 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no celular, quero navegar entre as telas com o polegar, para achar perfil, clã e ranking sem zoom.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.
- O visual da S44 (`ui/retro.css`, barra de cima com a trilha) foi pensado para 1280×720 ou mais.

## Escopo
- Barra de cima compacta no celular: logo, conta e um menu (gaveta) com as telas do portal; tocador da trilha recolhido no menu.
- Base responsiva do design system de 360 a 600 px: `Page`, `Panel`, `Tabs` (rolagem horizontal), `Table` (rolagem dentro do painel, primeira coluna fixa), `Dialog` em tela cheia, `Field` e `Button` com alvo de toque de 44 px.
- Estilo retrô da S44 mantido (tokens, fonte única, contraste AA); nada de estilo fora dos tokens.
- Volta a captura de 360 px nas telas do portal (só elas).

## Critérios de aceite
- [x] Em 360 e 412 px de largura, nenhuma tela do portal tem rolagem horizontal da página (teste com viewport de celular).
- [x] Alvos de toque com pelo menos 44 px; contraste AA.
- [x] Desktop sem mudança visual.

## Notas técnicas
- Media queries por largura já existem (`components.css`, `shell.css` em 30/40 rem); juntar num breakpoint de celular e usar `pointer: coarse` só para o tamanho dos alvos.
- Navegação por gamepad/teclado continua (desktop).

## Notas de implementação
- Estilos do celular em `ui/phone.css`, só com `data-phone` no `<html>` (o `Root` põe com `isPhone()`): desktop não muda nem com janela estreita.
- Barra: logo só com o ícone, trilha, sino e conta (nome cortado) e o botão de menu, que abre a navegação em gaveta (fecha ao trocar de tela). O tocador ficou na barra (é pequeno), não na gaveta.
- Base: margem de 16 px, alvos de 44 px, campos com 16 px (sem zoom do Safari), tabela com a 1ª coluna fixa e rolagem dentro do painel, diálogo em tela cheia. Conferência de rolagem lateral em 360/412 px: script do fechamento (`tools/visual-compare/phone-check.mjs`).
