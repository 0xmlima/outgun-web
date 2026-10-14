# OG-081 — Cadastro, login e recuperação de senha

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S8 |
| Status | Concluído |
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
- [x] Fluxos E2E de cadastro, login, recuperação de senha por e-mail e exclusão passando.
- [x] Login aceita nome de usuário sem diferenciar maiúsculas; e-mail nunca é exibido publicamente.
- [x] Após 5 senhas erradas, novas tentativas esperam (limite por usuário e por IP).
- [x] Senhas nunca logadas; testes de segurança básicos (OWASP) passando.

## Notas técnicas
- —

## Notas de implementação
- **API** (`apps/api`, migration `0002_password_resets`): `POST /auth/register|login|logout`, `GET /auth/me`, `POST /auth/password/forgot|reset`, `POST /account/password`, `GET /account/export`, `DELETE /account`. Implementação própria (sem Better Auth): poucas rotas, controle total do fluxo e nenhuma dependência nova além de `@fastify/cookie`.
- **Senha:** argon2id com os parâmetros mínimos da OWASP (19 MiB, t=2, p=1), 8 a 128 caracteres. Usuário inexistente confere contra um hash descartável (mesmo tempo de resposta).
- **Nome de usuário:** `checkName` = `check_name` do original (`src/commont.cpp:190`: até 15, imprimíveis, sem só espaços/NBSP, sem espaço nas pontas), mais a restrição a Latin-1 (as fontes do jogo só têm esses glifos). Unicidade por `username_key` (por ora NFKC + minúsculas; o OG-082 troca pela comparação normalizada do `makeComparable`).
- **Sessão:** cookie `og_session` httpOnly, SameSite=Lax, Secure em produção, 30 dias renovados a cada dia de uso; o banco guarda só o SHA-256 do token.
- **CSRF:** além de SameSite=Lax, a API só aceita JSON (removido o parser text/plain) e recusa `Sec-Fetch-Site: cross-site` e `Origin` fora de `WEB_ORIGINS`. O cliente fala com a API na mesma origem (`/api`, repassado pelo Vite; em produção, proxy ou `VITE_API_URL`).
- **Força bruta (RN-PLT-06):** 5 falhas por nome de usuário **ou** 10 por IP → espera de 30 s, dobrando a cada nova falha até 15 min; o contador zera 1 h após a última falha ou num login certo. Durante a espera a senha nem é conferida (429 + Retry-After). O limite por IP é 10 (e não 5) para não travar jogadores atrás do mesmo NAT; o por usuário segue o critério. Contadores no Redis quando há `REDIS_URL`, senão em memória. Troca de senha e exclusão de conta usam a mesma espera.
- **Enumeração:** login com erro genérico e mesmo tempo; recuperação responde 202 igual sempre e envia o e-mail sem `await`. O cadastro diz se o nome está em uso (o nome é público, é o nick) e se o e-mail está em uso — isso revela que um e-mail tem conta, mitigado pelo limite de 10 cadastros/hora por IP (alternativa seria um e-mail "alguém tentou se cadastrar", fora do v1).
- **Recuperação (RN-PLT-03):** token de 256 bits, link `WEB_URL/reset-password#token=…` (no fragmento, para não ir a logs nem a Referer; a tela tira o token da barra de endereço), 30 min, uso único, só o último link vale, até 3 por conta por hora. Redefinir encerra **todas** as sessões e entra com uma nova; trocar a senha logado encerra as outras.
- **E-mail:** sem SMTP (o nodemailer é MIT-0, fora da lista de licenças aprovadas). `MAILER=mailpit` (dev, testado com `axllent/mailpit:v1.27` no `compose.yaml`), `resend` (produção, API HTTP; **não testado sem chave**), `memory` (testes/E2E, com `GET /dev/mail` só com `DEV_ROUTES=1` fora de produção) e `log`. Modelos em pt-BR e inglês (outros idiomas recebem inglês). O provedor de produção é decisão de custo do PO — ver relatório da sprint.
- **LGPD (RN-PLT-04):** exportação em JSON (conta, perfil, sessões, ranking, partidas; nunca o hash). Exclusão pede a senha, apaga a conta (cascata em sessões, perfil, ranking, links) e **anonimiza** as partidas: `user_id` nulo e nome trocado por `(anon)`. A auditoria de moderação (`admin_actions`) mantém os nomes copiados (interesse legítimo), sem vínculo com a conta.
- **Segurança extra:** `x-content-type-options: nosniff` em tudo e `cache-control: no-store` nas rotas de conta; `TRUST_PROXY` desligado por padrão (só confiar em X-Forwarded-For atrás de proxy).
- **Cliente web:** telas Entrar, Criar conta, Esqueceu a senha, Redefinir senha, Conta (trocar senha, exportar, sair, excluir) no estilo dos menus; o Menu ganhou o item `text` (Textfield do original: digitação com números e espaço enquanto ativo, senha mascarada com `*`, `<input>` real transparente por cima para leitores de tela e gerenciadores de senha). O início mostra "Conta — nome" quando logado. Corrigidas duas corridas entre os redirecionamentos de "já logado"/"não logado" e a navegação após entrar/sair.
- **Testes:** 32 novos na API (fluxos completos com Postgres real, espera após 5 falhas, por IP, link expirado/reutilizado, CSRF, cabeçalhos, senha e token fora dos logs, `checkName` com acentos/NBSP/controle/grego, limitador com relógio falso). Roteiro E2E no navegador `tools/visual-compare/auth.mjs`: 14/14 (cadastro → sair → login com erro → login → esqueci → e-mail → redefinir → link reutilizado → excluir → login recusado), sem erros no console; prints `tools/parity/out/prints/og081-*.png`.
