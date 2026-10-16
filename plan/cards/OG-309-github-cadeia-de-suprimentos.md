# OG-309 — GitHub e cadeia de suprimentos: varredura de segredos, Dependabot e proteção de branches

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S29 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como mantenedor, quero o repositório público protegido contra vazamento de segredos e dependências vulneráveis, para que ninguém comprometa o jogo pelo código.

## Contexto
Auditoria de segurança de 2026-10-16 (`plan/reports/S29-auditoria-seguranca.md`), guiada pelo OWASP Cheat Sheet Series: CI CD Security, GitHub Actions Security, NPM Security, Software Supply Chain Security, Vulnerable Dependency Management, Secrets Management.

Achados: o repositório está **público** (a memória o dava como privado) com varredura de segredos, proteção de push e Dependabot **desligados** e `main`/`v2` sem proteção. Varredura do histórico (gitleaks, 281 commits): nenhum segredo real, só constantes de teste. `pnpm audit --prod` limpo; 3 vulnerabilidades altas só em ferramenta de teste (puppeteer-core). Actions referenciadas por tag (`@v4`), sem `permissions` mínimas; `deploy.yml` do Fly sem uso.

## Escopo
- Ligar secret scanning + push protection e Dependabot (alertas e PRs de segurança para npm, Actions e Docker).
- Proteção de `main` e `v2`: sem force push nem exclusão; CI obrigatório (admin pode passar, para o fluxo do agente).
- Actions fixadas por SHA e `permissions: contents: read` por padrão.
- gitleaks no CI.
- Atualizar puppeteer-core (`tools/visual-compare`).
- Remover o `deploy.yml` do Fly e o segredo `FLY_API_TOKEN` (deploy é pela VPS).

## Critérios de aceite
- [ ] Configurações do repositório ligadas (conferidas pela API do GitHub).
- [ ] CI com gitleaks e Actions por SHA.
- [ ] `pnpm audit` sem vulnerabilidade alta.

## Notas técnicas
## Notas de implementação
