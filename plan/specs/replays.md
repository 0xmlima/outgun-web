# Replays: gravação (OG-090) e formato

Fontes: `src/server.cpp:675-760` (`recording_active`, `start_recording`, `stop_recording`, `record_init_data`), `src/server.cpp:1575-1595, 1660-1760` (frame do replay), `src/servnet.cpp:197-230` (`record_message`, `broadcast_screen_message`), `src/protocol.h:38` (`REPLAY_VERSION = 2`), setting `recording`.

## Original
- Grava se `recording` > 0 e há ≥ 2 jogadores; começa a cada início de partida (`start_recording` depois do placar) e termina no fim (`stop_recording`).
- Arquivo `replay/AAAA-MM-DD_HHMMSS.replay`: identificação, `REPLAY_VERSION`, nº de frames (preenchido no fim), nome do servidor, `max_players`, título do mapa; depois as mensagens de "espectador" (`record_init_data`: boas-vindas, mapa, jogadores, bandeiras, placar) e, a cada frame, um bloco com todos os jogadores (posição, controles, power-ups, visibilidade, ping em rodízio).
- Mensagens de sala (`broadcast_screen_message`) vão com a sala; mensagens só para um jogador vão como `pid_record` quando importam ao espectador (chat de time incluso).
- Só fica o arquivo se `recording` ≤ humanos no fim; senão é apagado.

## Web
- Formato próprio, versão no cabeçalho: `"OGWR"` + u32 `REPLAY_VERSION` (1) + u32 `PROTOCOL_VERSION` + gzip(corpo). Corpo: u32 + cabeçalho JSON (`roomId`, `mode`, `preset`, `map`, `mapTitle`, `maxPlayers`, `startedAt`, `startFrame`, `frames`) + blocos u32 + `encodeFrame(...)`. Código em `packages/protocol/src/replay.ts` (puro; o leitor do OG-091 usa `DecompressionStream`).
- Bloco 0: o que a sala mandaria a um espectador ao entrar (`welcomeMessages` sem `welcome`). Um bloco por frame: `replayFrame` (mensagem 31: todos os jogadores, com sala) + tudo o que foi difundido no frame (outbox) + eventos de sala (foguetes, power-ups) + chat de time.
- Começa a cada `startGame` e quando o 2º jogador reinicia a partida; termina no relatório da partida (o último bloco leva o placar e `statsReady`). Troca de mapa por voto descarta a gravação em curso.
- Gravado em disco pelo game server (`REPLAY_DIR`, padrão `var/replays`), servido em `GET /replays/<serverMatchId>.ogr`; a URL vai no relatório (`replayUrl`) e a API guarda em `matches.replay_url` (migration 0007), devolvida em `GET /matches/:id`.
- Retenção: `REPLAY_RETENTION_DAYS` (30; 0 = para sempre), limpeza na partida e a cada hora. Object storage fica para o OG-103 (a interface `save(key, data) → url` já isola o destino).
- Medido: 10 min, 16 jogadores andando e atirando = **1,5 MB** (critério ≤ 5 MB).

## Divergências (D-28)
- Grava sempre que o game server tem destino de replays (`REPLAYS=0` desliga), não só com `recording` > 0; `recording` continua sendo o mínimo de humanos no fim (mínimo 1).
- Sem o ping em rodízio e sem sons no replay v1 (a mensagem `sound` não tem posição); o player pode derivar sons dos eventos.
- Replay apagado pela retenção deixa a URL na API apontando para 404.
