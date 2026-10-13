# OG-081 — Cadastro, login e recuperação de senha

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S8 |
| Status | Pronto |
| Dependências | [OG-080](OG-080-api-db.md) |
| Regras de negócio | RN-PLT-01, RN-PLT-02, RN-PLT-03, RN-PLT-04, RN-PLT-06, RN-MOD-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero criar conta com nome de usuário e senha (e um e-mail só para recuperar a senha), para jogar no modo Ranked, ter nome protegido e histórico.

## Contexto e referências no original
- No original: senha por nome em `auth.txt` (`auth.cpp`) e token do master server. Substituídos por contas.

## Escopo
- Cadastro com **nome de usuário** (RN-NOM-01, único), **senha** (mín. 8, argon2id) e **e-mail obrigatório só para recuperação** (D-10, RN-PLT-01). Login com usuário + senha, logout. Sem OAuth e sem confirmação obrigatória de e-mail no v1.
- Recuperação de senha por e-mail (RN-PLT-03): link de uso único de 30 min, resposta idêntica exista ou não a conta, troca de senha encerra outras sessões.
- Envio de e-mail transacional (SMTP ou provedor como Resend/SES), com modelo em pt-BR e en; em desenvolvimento, caixa de saída local (ex. Mailpit).
- Proteção contra força bruta (RN-PLT-06).
- Sessão em cookie httpOnly/SameSite; CSRF.
- Exclusão e exportação de dados (LGPD).
- Rate limit e proteção contra enumeração de contas.

## Critérios de aceite
- [ ] Fluxos E2E de cadastro, login, recuperação de senha por e-mail e exclusão passando.
- [ ] Login aceita nome de usuário sem diferenciar maiúsculas; e-mail nunca é exibido publicamente.
- [ ] Após 5 senhas erradas, novas tentativas esperam (limite por usuário e por IP).
- [ ] Senhas nunca logadas; testes de segurança básicos (OWASP) passando.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
