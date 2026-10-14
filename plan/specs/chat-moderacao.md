# Spec: chat, comandos e moderação
Card(s): OG-046 · RNs: RN-CHT-01, RN-CHT-02, RN-CHT-03, RN-CHT-04, RN-NOM-03

## Resumo
Port de `Server::chat`: mensagens normais e de time, anti-flood, comandos de jogador e de admin,
silêncio, expulsão e ban com contagem de 10 s, `/set` de regras e auditoria das ações.

## Fonte
- `src/server.cpp:1188-1477` — `Server::chat`: despacho de `/comando`, textos de ajuda e erros.
- `src/server.cpp:1478-1530` — mensagem normal: anti-flood, mute, `isFlood`, `(TAG) nome:`, `.` = time, smute só para o próprio, `logChat`.
- `src/world.cpp:3126-3132` — `simulatePlayerPrePhysics`: `talk_temp -= 0.1` (mín. 0), `talk_hotness -= 0.1` (mín. 1) por frame; `src/world.cpp:869-870`: começam em 0 e 1.
- `src/commont.cpp:202-214` — `isFlood`: mesmo caractere 7 vezes seguidas.
- `src/commont.h:54` — `max_chat_message_length = 200`.
- `src/server.cpp:106-160` — `mutePlayer`, `doKickPlayer` (`kickTimer = 100` frames), `kickPlayer`, `banPlayer`; `src/server.cpp:1635-1641` — contagem: aviso a cada segundo nos últimos 5 s (`data_disconnecting`) e desconexão.
- `src/servnet.cpp:1178-1197` — `broadcast_mute_message` (o alvo não recebe se `inform_target` for falso) e `broadcast_kick_message` (todos).
- `src/server_settings.cpp:378-430` — `listSettings`, `executeLine`, `processLine` (`/set`); `src/gamemod.cpp`/`gamemod.h` — `get()` de cada tipo.
- `src/world.cpp:1676-1700` — `printTimeStatus` (`/time`); `src/utility.cpp:514-576` — `approxTime` e `formatDuration`.
- `src/clientbase.cpp` (`data_player_mute`, `data_player_kick`) — textos do cliente.

## Algoritmo
```
chat(pid, msg):
  se msg vazia: nada
  se msg começa com '/': comando (abaixo)
  senão se msg só tem espaços: nada
  temp += hotness; hotness += 3; temp = min(temp, 18); hotness = min(hotness, 6)
  se temp > 10: temp = 18; avisa "too much talk"; descarta
  senão se muted == 1: avisa "você está silenciado"; descarta
  senão se isFlood(msg): descarta
  senão: texto = [(TAG) ]nome: trim(msg sem o '.' inicial)
         muted == 2 → só para o próprio; '.' → time; senão → todos; log se log_player_chat
```
Comandos: `help`, `info` (se houver `info_message`), `sayadmin` (se `sayadmin_enabled`), `time`;
admin: `list`, `kick`, `ban`, `mute`, `smute`, `unmute`, `forcemap`, `set`. Comando de admin sem
permissão cai em "Unknown command X. Type /help for a list." (mesma cadeia de `else if` do original).

## Casos de borda
1. Três mensagens no mesmo frame: temp 1, 5, 11 → a 3ª é descartada (fica em 18; leva ~8 s para voltar).
2. Uma mensagem a cada 3 s nunca bloqueia; a cada 1 s bloqueia (testado).
3. `/mute` em quem já está mudo e `/smute` em quem está com mute normal: nada acontece.
4. `/unmute` de smute: o alvo não é avisado (nunca soube); mute normal: avisado.
5. `/kick` em quem já está sendo expulso: nada (a contagem não reinicia).
6. `/ban` de si mesmo, tempo ≤ 0 ou > 10 080 min: recusado com os textos do original; tempo omitido = 60 min.
7. `/forcemap` sem voto (ou votando no mapa atual) reinicia o mapa atual.

## Divergências intencionais (D-21)
1. **Admin = administrador da plataforma** (flag `admin` do ticket, OG-083), no lugar das classes do `auth.txt`. Não há "shell admin" nem `/shutdown`.
2. **`/set`**: só as regras de jogo (categorias Game config, Health/energy/shooting, Powerups, Physics, com efeito na web); as do servidor (nome, rotação, site, bots, geral) ficam com a operação. Preset travado (Ranked, RN-MOD-04) não aceita `/set`. A mudança vale na hora (mesmo objeto de configurações da simulação) e os clientes recebem `serverSettings` com as linhas aplicadas e o tempo de mapa, como o `commit(reload)` do original. `/set reset` volta ao preset.
3. **Motivo** opcional em `/kick n motivo` e `/ban n [min] motivo` (o original não tinha). O alvo vê "Reason: …".
4. **Ban** vale na sala (conta e IP) até o fim do prazo e é gravado na API (`bans` com `room_id`), que recusa novos tickets (OG-083). No original o ban era por IP no `auth.txt`.
5. **Auditoria (RN-CHT-04)**: toda ação (`kick`, `ban`, `mute`, `smute`, `unmute`, `forcemap`, `set`, `sayadmin`) vai para `POST /internal/admin-actions` (autor, alvo, motivo, duração, IP do alvo nos detalhes). `/sayadmin` vira registro de auditoria (no original ia para um log e para o shell de admin).
6. **`/bot`** fica para o OG-048 (IA de bots); até lá responde "Unknown command".
7. **Filtro de palavras** (novo, opcional por sala, `CHAT_FILTER`): palavras inteiras da lista viram `*`, sem diferenciar maiúsculas e acentos.
8. **Flags do `/list`**: `M` = tem conta, `R` = sala Ranked com conta, `A` = admin (sem `S`, que era o `auth.txt`).
9. Chat com mais de 200 caracteres já é mensagem inválida desde o OG-043 (expulsão por `client_misbehavior`).

## Vetores de teste
`apps/game-server/src/chat.test.ts` (anti-flood, `isFlood`, `formatDuration`, filtro),
`apps/game-server/src/moderation.test.ts` (comandos e moderação na sala),
`packages/settings/src/console.test.ts` (`/set`), `apps/web/src/game/hud/feed.test.ts` (textos e
`approxTime`), `apps/api/src/app.test.ts` (auditoria e ban), `tools/visual-compare/moderation.mjs` (navegador).
