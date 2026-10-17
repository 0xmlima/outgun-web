# Auditoria de segurança da operação (2026-10-16) — base da S29

Guiada pelo [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/). A revisão da S11
(`OG-104-seguranca.md`, ASVS nível 1) cobriu a aplicação: autenticação, sessão, CSRF, validação, erros e
anti-cheat. Esta cobre o que orbita o código: servidor, banco, containers, backups, GitHub, contas dos
provedores, DNS e borda. Tudo foi lido sem alterar nada (SSH na VM, `docker inspect`, `psql`, API do
GitHub, gitleaks no histórico, `pnpm audit`, cabeçalhos do site no ar).

## Achados

| # | Gravidade | Achado | Guia OWASP | Card |
|---|---|---|---|---|
| S1 | **Alta** | Backups só na própria VM e sem cifra: perder a máquina é perder o banco e os backups (o volume que parecia expor os dados do banco ao container de backup é anônimo e vazio — corrigido depois da auditoria) | Database Security, Cryptographic Storage | OG-307 |
| S2 | **Alta** | Contas que controlam tudo (GitHub, Oracle, Cloudflare, Resend, Registro.br) sem MFA confirmado | Multifactor Authentication, Secrets Management | OG-310 |
| S3 | Média | API usa usuário do Postgres com SUPERUSER (defesa em profundidade: as consultas são parametrizadas) | Database Security, SQL Injection Prevention | OG-308 |
| S4 | Média | Repositório **público** sem varredura de segredos, Dependabot nem proteção de branches | CI CD Security, GitHub Actions Security, Software Supply Chain | OG-309 |
| S5 | Média | SSH: 1.153 tentativas em 24 h sem bloqueio; 21 atualizações e reinício de kernel pendentes | Attack Surface Analysis, Vulnerable Dependency Management | OG-306 |
| S6 | Média | Containers sem limite de memória numa VM de 1 GB, sem `cap_drop`/`no-new-privileges`; todos na mesma rede | Docker Security, NodeJS Docker, Network Segmentation, Denial of Service | OG-312 |
| S7 | Média | Sem alerta de queda, disco cheio ou backup falhando; eventos de segurança sem padrão | Logging, Logging Vocabulary | OG-313 |
| S8 | Média | Admin e moderador entram só com senha | Multifactor Authentication, Authentication | OG-314 |
| S9 | Baixa | HSTS só na API, não nas páginas; WebSocket sem checagem de `Origin` | HTTP Strict Transport Security, WebSocket Security | OG-311 |
| S10 | Baixa | Sem `SECURITY.md`/`security.txt` num repositório público | Vulnerability Disclosure | OG-311 |
| S11 | Baixa | `rpcbind` ouvindo (bloqueado pelo firewall); `X11Forwarding yes`; cópias `.env.bak-*` no servidor | Attack Surface Analysis, Secrets Management | OG-306, OG-310 |
| S12 | Info | 3 vulnerabilidades altas só em ferramenta de teste (puppeteer-core), fora da produção | NPM Security | OG-309 |

## Conferido e em ordem

- **Segredos no histórico:** gitleaks em 281 commits de todos os branches: 13 ocorrências, todas constantes de teste; nenhum segredo de produção (banco, chaves internas, Resend, métricas) aparece em commit algum.
- **Dependências de produção:** `pnpm audit --prod` sem vulnerabilidades; versões fixas no lockfile.
- **SSH:** só chave (senha e teclado desligados); firewall com 22/80/443; Postgres e Redis sem porta pública.
- **TLS:** só TLS 1.2+ (1.1 recusado), certificados Let's Encrypt renovados pelo Caddy; segredos com 32 caracteres; `.env` com permissão 600; backups com permissão 700.
- **Aplicação (S11, ainda válido):** argon2id, sessões com cookie httpOnly/SameSite/Secure, CSRF, CSP sem `unsafe-eval`, `X-Frame-Options: DENY`, limites de taxa, tickets Ed25519 de uso único, servidor autoritativo.
- **Containers da API e do game server:** rodam como usuário `node`, não root; nenhum privilegiado nem com o socket do Docker.

## Guias revisados que não se aplicam ou já estão cobertos

File Upload (não há upload), XML/XXE, LDAP, GraphQL, OAuth2/SAML, Serverless, Kubernetes, Deserialization
(só JSON validado por schema), Server Side Request Forgery (o servidor não busca URLs do usuário),
Unvalidated Redirects (redirecionamentos só para o próprio domínio), Mass Assignment (schemas
fechados), Clickjacking (`frame-ancestors 'none'`), Password Storage, Session Management, CSRF, XSS e
JSON Web Token (cobertos na S11).

## Sprint

- **S29 (13 pts):** OG-306, OG-307, OG-308, OG-309, OG-310, OG-311.
- **Backlog para a S30 (11 pts):** OG-312, OG-313, OG-314.
