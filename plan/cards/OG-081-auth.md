# OG-081 — Cadastro e login

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S8 |
| Status | Backlog |
| Dependências | [OG-080](OG-080-api-db.md) |
| Regras de negócio | RN-PLT-01, RN-PLT-02, RN-PLT-03, RN-PLT-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero criar conta e fazer login com segurança, para ter nick protegido, ranking e histórico.

## Contexto e referências no original
- No original: senha por nome em `auth.txt` (`auth.cpp`) e token do master server. Substituídos por contas.

## Escopo
- Cadastro e-mail+senha (argon2id), verificação de e-mail, login, logout, reset de senha, OAuth opcional.
- Sessão em cookie httpOnly/SameSite; CSRF.
- Exclusão e exportação de dados (LGPD).
- Rate limit e proteção contra enumeração de contas.

## Critérios de aceite
- [ ] Fluxos E2E de cadastro, login, reset e exclusão passando.
- [ ] Senhas nunca logadas; testes de segurança básicos (OWASP) passando.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
