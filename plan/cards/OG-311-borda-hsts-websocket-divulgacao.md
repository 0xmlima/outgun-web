# OG-311 — Borda: HSTS em tudo, origem do WebSocket e canal de divulgação de falhas

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S29 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o navegador sempre use HTTPS e que outro site não consiga abrir conexões de jogo em meu nome.

## Contexto
Auditoria de segurança de 2026-10-16 (`plan/reports/S29-auditoria-seguranca.md`), guiada pelo OWASP Cheat Sheet Series: HTTP Strict Transport Security, HTTP Headers, WebSocket Security, Vulnerability Disclosure.

Achados: o HSTS só sai nas respostas da API, não nas páginas do site; o game server não confere o `Origin` do WebSocket (o ticket assinado de uso único já impede o sequestro de sessão; isto é defesa em profundidade). Repositório público sem `SECURITY.md` nem `/.well-known/security.txt`.

## Escopo
- HSTS (`max-age=31536000; includeSubDomains`) em todas as respostas, pelo Caddy da borda.
- Game server: lista de origens aceitas no upgrade do WebSocket (o domínio do site; vazio = qualquer, para desenvolvimento).
- `SECURITY.md` e `security.txt` com o contato para relatar falhas.

## Critérios de aceite
- [ ] HSTS nas páginas do site.
- [ ] WebSocket de outra origem recusado (teste).
- [ ] `https://outgunweb.com.br/.well-known/security.txt` no ar.

## Notas técnicas
## Notas de implementação
