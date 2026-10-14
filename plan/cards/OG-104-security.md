# OG-104 — Segurança e anti-cheat

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S11 |
| Status | Em revisão |
| Dependências | [OG-043](OG-043-client-input.md), [OG-081](OG-081-auth.md) |
| Regras de negócio | RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero partidas justas e meus dados protegidos.

## Contexto e referências no original
- Original: servidor autoritativo, validações em `processMessage`, bans em `auth.cpp`.

## Escopo
- Revisão OWASP ASVS L1 da API; headers de segurança; CSP.
- Anti-cheat: validação de input, detecção de taxa anômala, AOI garantida, relatórios de jogador.
- Bans por conta e dispositivo/IP.

## Critérios de aceite
- [x] Relatório de revisão sem achados altos abertos.
- [x] Teste: cliente modificado não obtém posição de inimigos fora da AOI.

## Notas técnicas
- —

## Notas de implementação
- Relatório: `plan/reports/OG-104-seguranca.md` (ASVS 4.0.3 L1 por capítulo, achados A0–A9, anti-cheat, lista para o deploy). Nenhum achado alto aberto.
- Corrigidos: **A0 (alta)** tickets `dev:` aceitos por padrão também em produção (entrar sem a API, driblando bans e senha de sala) — agora desligados com `NODE_ENV=production`; **A1** 5xx devolvia a mensagem interna (agora `{ error: 'internal', reqId }`); **A2** senhas comuns aceitas (lista do SecLists, MIT, creditada em CREDITS.md; também senha = nome/e-mail); A3 cabeçalhos da API; A4 CSP do cliente (o PixiJS passou a usar `pixi.js/unsafe-eval`, sem `new Function`; o E2E roda sob a CSP e falha em violação); A5 limite de conexões por IP; A6 ban por dispositivo (D-33).
- Anti-cheat: `anticheat.test.ts` sobe o servidor de verdade e usa um cliente cru (`ws-test-client.ts`, extraído do `server.test.ts`): pedindo 255 jogadores de minimapa por frame, ele não recebe o inimigo que está sozinho em outra sala (nem no frame, nem no minimapa, nem nas propriedades), e recebe quando o inimigo entra na sala dele (controle); mensagem do servidor forjada expulsa com 4003; a 4ª conexão do mesmo IP (limite 3 no teste) leva 429.
- Denúncia: `/report nome motivo` (novo na web; texto em inglês como os demais comandos do console), 3 por 10 min e uma por alvo; `POST /internal/reports` grava em `player_reports` (migration 0009, reversível) com o IP e o hash do dispositivo do alvo, para o painel do OG-087.
- Ban por dispositivo: o cliente manda `device` (id aleatório do `localStorage`) no join e no quick-join; a API confere bans por `device_hash` e põe o hash no ticket (`dev`); o `/ban` do game server leva o hash para a API e para o ban local da sala.
- `pnpm audit --prod`: nenhuma vulnerabilidade conhecida.
