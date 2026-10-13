# OG-046 — Chat, comandos e moderação

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S8 |
| Status | Em revisão |
| Dependências | [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-CHT-01, RN-CHT-02, RN-CHT-03, RN-CHT-04, RN-NOM-03 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero conversar com todos ou só com meu time; como moderador, quero silenciar, expulsar e banir.

## Contexto e referências no original
- `Server::chat` (`server.cpp:1188-1530`).
- `isFlood`, `check_name` (`commont.cpp:190-215`).
- `doc/admin.html`.

## Escopo
- Chat geral e de time, anti-flood, comandos de jogador e admin, `/set` com permissões, auditoria.
- Filtro de palavrões configurável (novo, opcional por sala).

## Critérios de aceite
- [x] Anti-flood com os mesmos limiares do original (testes).
- [x] Ações de admin persistidas com autor, alvo, motivo e duração.

## Notas técnicas
- —

## Notas de implementação
- Spec: [plan/specs/chat-moderacao.md](../specs/chat-moderacao.md); decisão **D-21** (PLAN seção 12).
- **Game server:** `src/chat.ts` (`TalkMeter` com os limiares do original — sobe `hotness`, +3, tetos 18/6, bloqueio acima de 10, esfria 0,1/frame só com o jogo rodando; `isFlood`; `formatDuration`; filtro de palavras) e `src/moderation.ts` (port de `Server::chat`: `/help`, `/info`, `/time`, `/sayadmin`; admin: `/list`, `/kick`, `/ban`, `/mute`, `/smute`, `/unmute`, `/forcemap`, `/set`), ligados à sala por uma interface (`ConsoleHost`). A sala ganhou id de `/list`, estado de silêncio, contagem de expulsão (100 frames, avisos nos últimos 5 s) e bans por conta/IP; o IP vem da conexão (ou de `X-Forwarded-For` com `TRUST_PROXY=1`).
- **`/set`:** `packages/settings/src/console.ts` porta `listSettings`/`executeLine`/`processLine` e os `get()` (textos iguais: "capture_limit = 8.", "Can't set ...", "You don't have permission ..."). Admin só mexe nas regras de jogo; preset travado (Ranked) não tem `/set`. Muda na hora e os clientes recebem `serverSettings` com as linhas aplicadas.
- **Auditoria (RN-CHT-04):** `POST /internal/admin-actions` na API (HMAC) grava autor, alvo, motivo, duração e detalhes em `admin_actions`; o ban também cria um registro em `bans` com `room_id` (no máximo 7 dias, checado no banco), que o `POST /rooms/:id/join` do OG-083 respeita. O game server envia com `PlatformClient` (`API_URL`, `GS_ID`, `GS_SECRET`; 3 tentativas) e registra no log. A assinatura HMAC passou de `apps/api` para `@outgun/tickets`, para os dois lados usarem o mesmo código.
- **Cliente:** feed com os textos do original para mute/unmute, kick/ban (com `approxTime`) e "Desconectando em N..."; a contagem não é mais tratada como erro de conexão.
- **Testes:** 14 em `chat.test.ts`, 14 em `moderation.test.ts`, 2 em `platform.test.ts` (corpo e HMAC conferido por um servidor HTTP local), 4 em `packages/settings/src/console.test.ts`, 2 no feed, 1 de integração na API (ação + ban). Roteiro `tools/visual-compare/moderation.mjs`: admin do seed faz `/list`, `/mute`, `/unmute`, `/kick` com motivo; alvo desconectado após 10 s; auditoria conferida no banco (prints `og046-*.png`).
- Fora do escopo: `/bot` (OG-048); painel de admin para ver a auditoria (OG-087).
