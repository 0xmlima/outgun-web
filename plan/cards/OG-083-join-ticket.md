# OG-083 — Ticket de entrada no game server

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S8 |
| Status | Em revisão |
| Dependências | [OG-081](OG-081-auth.md), [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-RNK-01, RN-PLT-02 |
| Skills | `outgun-card-workflow` |

## História
Como sistema, quero que o game server confie na identidade do jogador sem consultar o banco a cada conexão.

## Contexto e referências no original
- Seção 5.4 do PLAN.
- Original: senha de servidor e de jogador no handshake (`servnet.cpp:3341-3365`).

## Escopo
- `POST /rooms/:id/join` → JWT (60 s) assinado com chave rotacionável; contém userId/guestId, nick, flags (ranqueado, admin).
- Validação no game server; senha de sala privada; bans.

## Critérios de aceite
- [x] Ticket expirado/adulterado é rejeitado.
- [x] Convidado só entra em salas Casual; o ticket informa se o jogador tem conta (requisito do Ranked, RN-MOD-03).

## Notas técnicas
- —

## Notas de implementação
- **Formato:** JWT compacto **Ed25519 (EdDSA)** em `packages/tickets` (só `node:crypto`). Assimétrico, e não HS256: os game servers têm só as chaves públicas e não conseguem emitir tickets, mesmo se um deles for comprometido. Claims: `iss`, `aud` (sala), `sub` (conta ou `guest:<uuid>`), `name`, `clan`, `acct` (tem conta, RN-MOD-03), `admin`, `ranked`, `iat`, `exp` (60 s), `jti`. O verificador só aceita `alg: EdDSA` (nada de `none` nem de troca de algoritmo), confere a chave pelo `kid`, a assinatura, a validade (±5 s de folga) e a sala.
- **Rotação:** `TICKET_SIGNING_KEYS` com várias chaves (a primeira assina, todas publicadas em `GET /.well-known/jwks.json`); o game server baixa o JWKS na partida e a cada 5 min (a cada 10 s enquanto não conseguir). Procedimento no `apps/api/README.md`; `node dist/cli.js ticket-key` gera chave. Fora de produção, a API gera uma chave a cada partida.
- **`POST /rooms/:id/join`:** sala existe; endereço do heartbeat (sala no ar há < 30 s) ou, fora de produção, `DEV_ROOM_WS_URL` (o heartbeat do game server é do OG-086); Ranked exige sessão (401 `account_required`); convidado passa por `checkGuestName` do OG-082 (sufixo `*`, nunca nome de conta ou reservado); ban de plataforma ou da sala, por conta ou IP, vigente e não revogado (403); senha da sala privada com argon2 e limite de 10 tentativas/min por IP e sala; lotação (409) quando a sala está no ar.
- **Game server:** `TicketAuth` confere o ticket e usa cada `jti` uma vez só (`ReplayGuard`); a identidade ganha `clanTag` e `admin`; o chat mostra `(TAG) nome: texto` (RN-NOM-03, `server.cpp:1513`); o `playerInfo` leva `admin`. Convidado com ticket na sala Ranked continua recusado pelo próprio servidor (`rankedNeedsAccount`), defesa em profundidade. Tickets `dev:Nome` continuam só com `DEV_TICKETS` (agora com o sufixo de convidado).
- **Cliente:** `/play` pede o ticket à API e conecta no endereço devolvido; recusas aparecem traduzidas (conta exigida, nome registrado, ban, senha, sala cheia/fora do ar). Sem API no ar, cai no `dev:` (só funciona se o servidor aceitar). Senha de sala privada no cliente fica para o lobby (OG-069).
- **Testes:** 5 em `packages/tickets` (válido, adulterado, outra chave, `kid` desconhecido, outra sala, `alg: none`, vencido, rotação, reuso), 8 de integração da rota (`apps/api/src/routes/join.test.ts`), 3 no WebSocket real do game server (ticket de conta no Ranked; adulterado, outra sala, vencido, chave desconhecida, reutilizado; convidado no Ranked) e 1 de chat com tag. Roteiro `tools/visual-compare/ticket.mjs` com o servidor recusando tickets dev: 7/7 (prints `og083-*.png`).
