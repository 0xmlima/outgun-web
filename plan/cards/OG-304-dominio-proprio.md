# OG-304 — Domínio próprio (outgunweb.com.br) com HTTPS atrás da Cloudflare

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S28 |
| Status | Em andamento |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero acessar o jogo por https://outgunweb.com.br, para ter um endereço fácil de lembrar e divulgar.

## Contexto
Pedido do PO em 2026-10-16. O domínio está na Cloudflare; o HTTPS entrava em loop porque o Caddy só conhecia o nome sslip.io e redireciona HTTP para HTTPS. Decisão do PO (recomendação do agente): Cloudflare em **Completo (Estrito)** com certificado Let's Encrypt emitido pelo Caddy (o Flexível deixaria as senhas sem criptografia entre a Cloudflare e o servidor).

## Escopo
- `deploy/vps/Caddyfile` e `compose.yml`: `DOMAIN_ALIASES` (nomes que redirecionam para `DOMAIN`, cada um com certificado).
- Servidor: `DOMAIN=outgunweb.com.br`, `DOMAIN_ALIASES=www.outgunweb.com.br 137-131-202-138.sslip.io`.
- README do deploy: como trocar de domínio e configurar a Cloudflare.

## Critérios de aceite
- [ ] https://outgunweb.com.br abre o jogo, com partida online funcionando (WebSocket).
- [ ] www e o endereço sslip.io antigo redirecionam para https://outgunweb.com.br.
- [ ] Funciona com a Cloudflare em Completo (Estrito).

## Notas técnicas
## Notas de implementação
