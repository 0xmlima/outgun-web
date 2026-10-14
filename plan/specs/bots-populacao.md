# Bots: população e nomes (OG-054)

Fontes: `src/server.cpp:884-1015` (`init_bots`, `create_bot_name`, `remove_bot`), `src/server.cpp:1328-1456` (`/bot`), `src/server.cpp:1950-1990` (`run_bot_thread`), `src/servnet.cpp:1336-1340, 1520, 1578` (`client_connected`/`client_disconnected`), `src/names.cpp`, `src/server_settings.cpp:220-225, 475-478`.

## Quantos bots (`init_bots`)
- `needed = max(bots_fill − humanos, min_bots) + extra_bots`; negativo → 0; `humanos + needed > max_players` → `max_players − humanos`.
- `balance_bot`: se `humanos + needed` for ímpar, mais um (o original não volta a limitar às vagas; a entrada do bot extra falha por falta de vaga).
- Sobrando bots, tira `playing − needed` com `remove_bot`; faltando, adiciona até `needed`.
- `remove_bot`: do time maior (empate = qualquer), primeiro um morto, depois um sem bandeira, depois qualquer do time; por fim qualquer bot (`teams.ts: botToRemove`).
- `check_bots` é ligado ao iniciar, em toda entrada e saída, nos comandos `/bot` e ao recarregar settings; a thread de bots recalcula em ≤ 15 ms. **Web:** a sala recalcula no começo do próximo frame (`Room.checkBots`).
- Humano entrando com a sala cheia: `client_connected` chama `remove_bot` antes de pôr o humano.

## Nomes (`create_bot_name`)
- "BOT " + nome; não repete nome já gerado na sala (`reservedBotNames`) nem o de um bot presente; corta em 15 caracteres.
- `bot_name_lang`: `fi` → `finnish_name(11)`; outro → `RandomName()` (sílabas). `bot_name_file` não é portado (não há arquivos de nomes na web).
- `names.cpp` usa `rand()`; em `Silaba()` o GCC avalia `PreVog() + Vog() + PosSemiVog() + PosConsProl()` da direita para a esquerda (confirmado compilando `names.cpp` no oráculo: golden em `bots.test.ts`).
- **Web:** gerador próprio (`GlibcRand(seed + 1)`) para não mudar a sequência de `rand()` do mundo.

## `/bot` (admin)
`list` (3 por linha, `%4d %-17s`, por time), `add n`/`remove n` (1..max_players, mexem em `extra_bots`), `fill n` (0..max_players), `balance on|off`, `ping p` (0..2000), `rename ID nome` (`check_name`). Textos do original, em inglês.

## Divergências (D-27)
- Sem humanos, nenhum bot (o original enche a sala só de bots).
- `/bot` também para o dono de sala Casual (como o `/set`); no Ranked não há `/bot` ("Bots are not allowed in Ranked rooms.") e `bots_fill` é ignorado (D-11).
- `/bot` não entra na auditoria (`admin_actions`): não afeta jogadores.
- `CASUAL_BOTS_FILL` (env do game server) define `bots_fill` das salas Casual; padrão 0 como o `gamemod.txt`.
- Marca de bot na UI: como o original, só o prefixo "BOT " no nome (o cliente original não mostra `is_bot`).
