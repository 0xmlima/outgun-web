# OG-104 — Revisão de segurança (OWASP ASVS 4.0.3 nível 1) e anti-cheat

Revisão feita na S11 (2026-10-14) sobre `apps/api`, `apps/game-server` e `apps/web`, lendo o código e
conferindo com testes automatizados (os testes citados rodam no `pnpm verify` e no CI). Escopo do
nível 1: o que um atacante consegue sem acesso ao servidor. Itens que só existem no ambiente
publicado (TLS, segredos, rede) ficam na lista de verificação do deploy (OG-103), no fim.

**Resultado: nenhum achado alto aberto.** Um achado alto e dois médios foram corrigidos neste card;
os baixos corrigidos ou aceitos estão justificados abaixo.

## Achados

| # | Severidade | Achado | Situação |
|---|---|---|---|
| A0 | Alta | O game server aceitava tickets `dev:Nome` por padrão também em produção (`DEV_TICKETS` só desligava com `0`): qualquer um entrava sem a API, driblando bans, senha de sala privada e a proteção de nomes | ✅ Corrigido: com `NODE_ENV=production` o padrão é desligado (só `DEV_TICKETS=1` liga) |
| A1 | Média | Erro 500 devolvia a mensagem interna da exceção ao cliente (ASVS 7.4.1) | ✅ Corrigido: `setErrorHandler` responde `{ error: 'internal', message: 'internal error', reqId }`; o detalhe vai só para o log e o serviço de erros. Teste em `observability.test.ts` |
| A2 | Média | Senhas comuns eram aceitas (ASVS 2.1.7) | ✅ Corrigido: cadastro, recuperação e troca recusam as ~2.100 senhas de 8+ caracteres da lista "10k-most-common" do SecLists e a senha igual ao nome ou ao e-mail (`weak_password`). Teste em `auth.test.ts` |
| A3 | Baixa | API sem cabeçalhos de segurança além de `nosniff` (ASVS 14.4) | ✅ Corrigido: CSP `default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options`, `Referrer-Policy`, COOP/CORP, `Permissions-Policy` e HSTS com cookies seguros |
| A4 | Baixa | Cliente web sem CSP (ASVS 14.4.3) | ✅ Corrigido: CSP sem `unsafe-eval`/`unsafe-inline` em scripts (`apps/web/security-headers.ts`); o PixiJS passa a usar `pixi.js/unsafe-eval` (sem `new Function`). O E2E roda com a CSP e falha em qualquer violação |
| A5 | Baixa | Um IP podia abrir conexões sem limite no game server (ocupar vagas, encher o processo) | ✅ Corrigido: `MAX_CONNECTIONS_PER_IP` (8; 429 na 9ª). Teste em `anticheat.test.ts` |
| A6 | Baixa | Ban só por conta e IP; convidado trocando de rede voltava (RN-PLT-05 pede dispositivo) | ✅ Corrigido: ban por dispositivo com o hash de um id aleatório do navegador |
| A7 | Baixa | `/metrics` aberto por padrão | Aceito: o token existe (`METRICS_TOKEN`) e em produção sem token o processo avisa no log; a porta de métricas deve ficar na rede interna (OG-103) |
| A8 | Info | Sem confirmação de e-mail no cadastro | Aceito: decisão de produto D-10 (e-mail só para recuperação); ASVS L1 não exige |
| A9 | Info | Swagger UI público em `/docs` | Aceito: a API é de código aberto (GPL) e as rotas internas exigem HMAC |

## ASVS nível 1 por capítulo

| Capítulo | Situação | Como |
|---|---|---|
| V2 Autenticação | ✅ | argon2id (19 MiB, t=2); senha de 8 a 128 caracteres, sem regra de composição, colar permitido; senhas comuns recusadas (A2); espera crescente após 5 falhas por usuário ou 10 por IP (30 s → 15 min); recuperação com token aleatório de uso único, 30 min, guardado como hash, mesma resposta exista ou não a conta; mesma resposta e tempo para usuário inexistente (hash descartável) |
| V3 Sessão | ✅ | Token aleatório novo a cada login, só o hash no banco; cookie `og_session` httpOnly, SameSite=Lax, Secure em produção; logout e exclusão de conta encerram a sessão; troca/recuperação de senha encerram as outras sessões; validade de 30 dias |
| V4 Controle de acesso | ✅ | Rotas de conta só agem na conta da sessão; admin e dono de sala conferidos no servidor (ticket assinado); rotas `/internal` com HMAC + janela de relógio; Ranked exige conta (RN-MOD-03) |
| V5 Validação | ✅ | Todo corpo e parâmetro com schema TypeBox; só JSON (sem `text/plain`); corpo até 256 KB; SQL sempre parametrizado (Drizzle/postgres.js); nomes por `checkName`; caminhos de arquivo (`/replays/:file`) por lista branca `^[\w-]+\.ogr$` |
| V7 Erros e log | ✅ | Logs JSON com segredos mascarados (senha, ticket, cookie, Authorization, assinatura); 5xx genérico (A1); `reqId` para correlação |
| V8 Proteção de dados | ✅ | `Cache-Control: no-store` em conta/autenticação; exportação e exclusão de conta (LGPD); IP só nas sessões, bans, auditoria e denúncias; dispositivo só como hash; erros do cliente sem dados do jogador |
| V9 Comunicação | ⏭ OG-103 | TLS e HSTS no proxy do deploy; a API já manda HSTS com `COOKIE_SECURE` |
| V10 Código malicioso | ✅ | `pnpm audit --prod`: nenhuma vulnerabilidade conhecida; licenças conferidas no CI; versões fixas no lockfile |
| V12 Arquivos | ✅ | Sem upload; replays servidos só pelo nome validado |
| V13 API | ✅ | CSRF: `Sec-Fetch-Site` + lista de origens em pedidos que mudam estado; limites de taxa (login, cadastro, recuperação, senha de sala, criação de sala); tickets Ed25519 de 60 s, uso único, só `EdDSA` (sem `alg: none`) |
| V14 Configuração | ✅ | Cabeçalhos (A3, A4); em produção `TICKET_SIGNING_KEYS` é obrigatória e `INTERNAL_SECRETS`/`GS_SECRET` não têm valor padrão (sem eles as rotas internas recusam); rotas de depuração (`DEV_ROUTES`, tickets `dev:`, A0) desligadas em produção |

## Anti-cheat no game server

| Proteção | Onde | Teste |
|---|---|---|
| Servidor autoritativo: o cliente só manda controles (8 bits), direção da arma (12 bits) e tiro; posição, vida e pontos vêm do servidor | `room.ts`, `packages/sim` | paridade e testes da sala |
| Validação e limite de taxa por tipo de mensagem; mensagem inválida, forjada ou em excesso → `client_misbehavior` (como o original) | `input-guard.ts`, `server.ts` | `input-guard.test.ts`, `anticheat.test.ts` (mensagem do servidor forjada) |
| AOI garantida no servidor: cada jogador recebe só quem está na sala dele e o minimapa permitido pelas regras do original; pedir o minimapa inteiro não muda nada | `aoi.ts` | `aoi.test.ts`, `anticheat.test.ts` (cliente cru pedindo 255 jogadores por frame não recebe o inimigo de outra sala; controle positivo na mesma sala) |
| Taxa anômala de conexões por endereço | `server.ts` | `anticheat.test.ts` |
| Denúncia de jogador: `/report nome motivo` → fila `player_reports` na API (alvo com conta, IP e dispositivo), 3 por 10 min e uma por alvo | `moderation.ts`, `POST /internal/reports` | `moderation.test.ts`, `app.test.ts` |
| Bans por conta, IP e dispositivo; de sala (até 7 dias) e de plataforma | `room.ts`, `join.ts`, `admin-actions` | `join.test.ts`, `app.test.ts` |
| Ticket assinado com identidade, papel e sala; uso único | `packages/tickets` | `server.test.ts` (ticket adulterado, de outra sala, vencido, reusado) |

Fora do alcance de um servidor autoritativo e aceito: mira assistida e leitura de tela pelo cliente
(o que o jogador já vê). A fila de denúncias e o painel admin (OG-087) são a resposta para isso.

## Lista de verificação do deploy (OG-103)

- TLS em tudo (HTTPS e WSS), HSTS no domínio; `COOKIE_SECURE=1` (padrão com `NODE_ENV=production`).
- Segredos fortes e únicos: `TICKET_SIGNING_KEYS`, `INTERNAL_SECRETS`/`GS_SECRET`, `METRICS_TOKEN` (ou métricas só na rede interna).
- Cliente servido com os cabeçalhos de `apps/web/security-headers.ts`, com `connect-src` listando os domínios reais da API, dos game servers e do serviço de erros.
- `TRUST_PROXY=1` só atrás do proxy (senão o IP dos bans e limites vem do cabeçalho do cliente).
- Postgres e Redis sem porta pública.
