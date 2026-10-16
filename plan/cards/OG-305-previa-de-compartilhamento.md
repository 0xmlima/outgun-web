# OG-305 — Prévia de compartilhamento (Open Graph) para WhatsApp e redes

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S28 |
| Status | Concluído |
| Dependências | [OG-304](OG-304-dominio-proprio.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o link do jogo apareça com título, descrição e imagem ao colar no WhatsApp, para convidar amigos com uma mensagem bonita.

## Contexto
Pedido do PO em 2026-10-16, junto da entrega do domínio próprio.

## Escopo
- `og:title`, `og:description`, `og:image` (1200×630), `og:url`, `og:type`, `og:site_name`, `og:locale` e `twitter:card` no `index.html`.
- Endereços absolutos com o domínio de quem serve o site (template do Caddy do cliente web), sem domínio fixo no código.
- Imagem com o visual do tema padrão (chão e paredes verdes, times vermelho e azul, mastro amarelo).

## Critérios de aceite
- [x] As tags saem com o domínio certo em https://outgunweb.com.br e em qualquer rota do app.
- [x] Imagem 1200×630, abaixo de 300 KB (limite prático do WhatsApp).

## Notas técnicas
## Notas de implementação
- Tags Open Graph e `twitter:card` no `index.html`; `og:url` e `og:image` com `https://{{html .Host}}/...`, preenchidos pelo `templates` do Caddy do cliente web (sem domínio fixo; `html` escapa o Host). Testado com o Caddy de produção na raiz e em rotas do app.
- Imagem `apps/web/public/og-image.png` (1200×630, 43 KB), gerada de `tools/og-image/card.html` (comando no topo do arquivo). Descrição do site passou para pt-BR.
