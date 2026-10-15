<!-- Gerado por `pnpm --filter @outgun/protocol gen:messages` a partir de src/messages.ts. Não edite à mão. -->

# Protocolo Outgun Web v4

Cada mensagem WebSocket binária contém uma ou mais mensagens: `[código u8][campos na ordem abaixo]`.
Inteiros little-endian; `string` e `lista` levam o comprimento como varuint (7 bits por byte).
Canal `frame`: estado do frame, pode ser descartado se chegar um mais novo; `event`: confiável e em ordem.

## Handshake

1. O cliente abre o WebSocket e envia `hello` com `protocol` e o ticket da API.
2. Versão diferente de 4 ou ticket inválido: `reject` e o servidor fecha a conexão.
3. Aceito: `welcome`, `serverSettings`, jogadores presentes, bandeiras, placar; depois `frame` a cada 100 ms.

## Mensagens

| Código | Nome | Direção | Canal | Origem no original | Descrição |
|---:|---|---|---|---|---|
| 1 | [`hello`](#hello) | cliente → servidor | event | conexão leetnet + `GAME_PROTOCOL` (`clientHello`) | Primeira mensagem do cliente: versão do protocolo e ticket da API (JWT). |
| 2 | [`welcome`](#welcome) | servidor → cliente | event | `data_first_packet` (`send_me_packet`) | Aceito na sala: quem sou, mapa atual e placar. |
| 3 | [`reject`](#reject) | servidor → cliente | event | `Connect_rejection_reason` | Conexão recusada (a conexão é fechada em seguida). |
| 4 | [`disconnecting`](#disconnecting) | servidor → cliente | event | `data_disconnecting`, `Disconnect_reason` | O servidor vai desconectar o jogador. |
| 5 | [`idleKickWarning`](#idlekickwarning) | servidor → cliente | event | `data_idlekick_warning` | Aviso de expulsão por inatividade. |
| 7 | [`resumeToken`](#resumetoken) | servidor → cliente | event | — (novo, OG-047) | Token para voltar à mesma vaga depois de uma queda de conexão (até 15 s). |
| 8 | [`resume`](#resume) | cliente → servidor | event | — (novo, OG-047) | Junto com o `hello`: pede de volta a vaga deixada numa queda de conexão. |
| 6 | [`serverSettings`](#serversettings) | servidor → cliente | event | `data_server_settings` | Configurações da sala: preset e gamemod completo (o cliente aplica com @outgun/settings). |
| 10 | [`input`](#input) | cliente → servidor | frame | dados de frame do cliente (`incoming_client_data`) | Controles do frame; enviado a cada frame do cliente. |
| 11 | [`fire`](#fire) | cliente → servidor | event | `data_fire_on` / `data_fire_off` | Botão de tiro pressionado ou solto. |
| 12 | [`dropFlag`](#dropflag) | cliente → servidor | event | `data_drop_flag` / `data_stop_drop_flag` | Tecla de largar bandeira. |
| 13 | [`suicide`](#suicide) | cliente → servidor | event | `data_suicide` | Suicídio. |
| 14 | [`changeTeam`](#changeteam) | cliente → servidor | event | `data_change_team_on` / `data_change_team_off` | Quer trocar de time. |
| 15 | [`mapExit`](#mapexit) | cliente → servidor | event | `data_map_exit_on` / `data_map_exit_off` | Voto para sair do mapa. |
| 16 | [`clientReady`](#clientready) | cliente → servidor | event | `data_client_ready` | Cliente carregou o mapa e pode nascer. |
| 17 | [`mapVote`](#mapvote) | cliente → servidor | event | `data_map_vote` | Voto no próximo mapa (−1 = nenhum). |
| 18 | [`negativeMapVotes`](#negativemapvotes) | cliente → servidor | event | `data_negative_map_votes` | Mapas que o jogador não quer. |
| 19 | [`chat`](#chat) | cliente → servidor | event | `data_text_message` | Mensagem de chat ou comando (/...). |
| 20 | [`setName`](#setname) | cliente → servidor | event | `data_name_update` | Troca de nome (convidados; contas usam o nome da conta). |
| 21 | [`favoriteColors`](#favoritecolors) | cliente → servidor | event | `data_fav_colors` | Cores preferidas, em ordem. |
| 22 | [`minimapBandwidth`](#minimapbandwidth) | cliente → servidor | event | `data_set_minimap_player_bandwidth` | Jogadores no minimapa por frame. |
| 30 | [`frame`](#frame) | servidor → cliente | frame | `broadcast_frame` | Estado do frame para um jogador: quem está na mesma sala, minimapa e o próprio estado. |
| 31 | [`replayFrame`](#replayframe) | servidor → cliente | frame | `record_message` (bloco do frame do replay) | Frame do replay (OG-090): todos os jogadores, de todas as salas, para um espectador onisciente. |
| 32 | [`spectatorStart`](#spectatorstart) | servidor → cliente | event | espectador do relay (`spectating_delay`) | Espectador ao vivo (OG-092): começa uma partida; em seguida vêm o estado inicial e os frames do replay, com o atraso da sala. |
| 40 | [`playerJoined`](#playerjoined) | servidor → cliente | event | `data_new_player` + `data_name_update` + `data_bot` | Jogador entrou na sala. |
| 41 | [`playerLeft`](#playerleft) | servidor → cliente | event | `data_player_left` | Jogador saiu. |
| 42 | [`playerName`](#playername) | servidor → cliente | event | `data_name_update` | Nome de um jogador. |
| 43 | [`playerInfo`](#playerinfo) | servidor → cliente | event | `data_crap_update` | Cor, situação da conta e ranking de um jogador. |
| 44 | [`teamChange`](#teamchange) | servidor → cliente | event | `data_team_change` | Jogador mudou de pid/time (troca de times); `swappedColor` 255 se não foi troca. |
| 45 | [`playersPresent`](#playerspresent) | servidor → cliente | event | `data_players_present` | Pids ocupados (ao entrar). |
| 46 | [`accelerationModes`](#accelerationmodes) | servidor → cliente | event | `data_acceleration_modes` | Bit por pid: aceleração relativa à arma. |
| 47 | [`flagModes`](#flagmodes) | servidor → cliente | event | `data_flag_modes` | Locks e capturas em efeito (`flagModeMask`). |
| 48 | [`minimapProperties`](#minimapproperties) | servidor → cliente | event | `data_minimap_player_properties` | Power-ups de jogadores vistos no minimapa. |
| 50 | [`flagUpdate`](#flagupdate) | servidor → cliente | event | `data_flag_update` (`ctf_net_flag_status`) | Estado de todas as bandeiras de um time. |
| 51 | [`scoreUpdate`](#scoreupdate) | servidor → cliente | event | `data_score_update` | Placar de um time. |
| 52 | [`rocketFire`](#rocketfire) | servidor → cliente | event | `data_rocket_fire` (`sendRocketMessage`) | Tiro: foguetes criados (o cliente os simula). |
| 53 | [`rocketVisible`](#rocketvisible) | servidor → cliente | event | `data_old_rocket_visible` | Foguete já em voo que entrou na visão. |
| 54 | [`rocketDelete`](#rocketdelete) | servidor → cliente | event | `data_rocket_delete` | Foguete removido (bateu); alvo 255 = parede. |
| 55 | [`powerCollision`](#powercollision) | servidor → cliente | event | `data_power_collision` | Atropelamento com power (efeito na sala). |
| 56 | [`sound`](#sound) | servidor → cliente | event | `data_sound` | Som do servidor (código de amostra). |
| 57 | [`powerupVisible`](#powerupvisible) | servidor → cliente | event | `data_pup_visible` | Power-up no chão. |
| 58 | [`powerupPicked`](#poweruppicked) | servidor → cliente | event | `data_pup_picked` | Power-up pego (some). |
| 59 | [`powerupTimer`](#poweruptimer) | servidor → cliente | event | `data_pup_timer` | Tempo restante de um power-up do jogador, em segundos. |
| 60 | [`weaponChange`](#weaponchange) | servidor → cliente | event | `data_weapon_change` | Nível de arma do jogador. |
| 61 | [`deathbringer`](#deathbringer) | servidor → cliente | event | `data_deathbringer` | Explosão de deathbringer. |
| 62 | [`frags`](#frags) | servidor → cliente | event | `data_frags_update` | Frags de um jogador. |
| 63 | [`kill`](#kill) | servidor → cliente | event | `data_kill` (`broadcast_kill`) | Morte com atacante. |
| 64 | [`suicideEvent`](#suicideevent) | servidor → cliente | event | `data_suicide` (`broadcast_suicide`) | Suicídio. |
| 65 | [`capture`](#capture) | servidor → cliente | event | `data_capture` | Captura. |
| 66 | [`flagTake`](#flagtake) | servidor → cliente | event | `data_flag_take` | Bandeira pega. |
| 67 | [`flagReturn`](#flagreturn) | servidor → cliente | event | `data_flag_return` | Bandeira devolvida. |
| 68 | [`flagDrop`](#flagdrop) | servidor → cliente | event | `data_flag_drop` | Bandeira largada de propósito ou entregue numa captura. |
| 69 | [`spawn`](#spawn) | servidor → cliente | event | `data_spawn` | Jogador nasceu. |
| 70 | [`waitingTime`](#waitingtime) | servidor → cliente | event | `data_waiting_time` | Frames até poder nascer. |
| 80 | [`mapChange`](#mapchange) | servidor → cliente | event | `data_map_change` (`send_map_change_message`) | Novo mapa: o cliente baixa por HTTP se não tiver (CRC). |
| 81 | [`mapChangeInfo`](#mapchangeinfo) | servidor → cliente | event | `data_map_change_info` | Votos para trocar de mapa. |
| 82 | [`worldReset`](#worldreset) | servidor → cliente | event | `data_world_reset` | Mundo reiniciado (antes do placar). |
| 83 | [`gameOver`](#gameover) | servidor → cliente | event | `data_gameover_show` | Mostra o placar de fim de partida. |
| 84 | [`startGame`](#startgame) | servidor → cliente | event | `data_start_game` | Partida começou. |
| 85 | [`mapTime`](#maptime) | servidor → cliente | event | `data_map_time` (`send_map_time`) | Tempo de mapa e restante, em segundos. |
| 86 | [`timeEvent`](#timeevent) | servidor → cliente | event | `data_5_min_left`, `data_1_min_left`, `data_30_s_left`, `data_time_out`, `data_extra_time_out`, `data_normal_time_out` | Avisos e fins de tempo. |
| 87 | [`mapList`](#maplist) | servidor → cliente | event | `data_map_list`, `data_quick_map_list`, `data_reset_map_list` | Rotação de mapas (lista completa; `revision` muda a cada alteração). |
| 88 | [`mapVotes`](#mapvotes) | servidor → cliente | event | `data_map_votes_update` | Votos por mapa. |
| 89 | [`currentMap`](#currentmap) | servidor → cliente | event | `data_current_map` | Índice do mapa atual na rotação. |
| 90 | [`brokenMap`](#brokenmap) | servidor → cliente | event | `data_broken_map` | O mapa atual tem erro e será trocado. |
| 100 | [`stats`](#stats) | servidor → cliente | event | `data_stats` (`send_stats`) | Estatísticas de um jogador. |
| 101 | [`movementShots`](#movementshots) | servidor → cliente | event | `data_movements_shots` | Movimento e tiros de um jogador. |
| 102 | [`teamMovementShots`](#teammovementshots) | servidor → cliente | event | `data_team_movements_shots` | Movimento e tiros dos dois times. |
| 103 | [`teamStats`](#teamstats) | servidor → cliente | event | `data_team_stats` | Contadores de um time e capturas (tempo em s, capturador, assistente). |
| 104 | [`statsReady`](#statsready) | servidor → cliente | event | `data_stats_ready` | Estatísticas finais enviadas (fim de partida). |
| 110 | [`text`](#text) | servidor → cliente | event | `data_text_message` (`Message_type`) | Texto para o jogador (chat, avisos do servidor). |
| 111 | [`tooMuchTalk`](#toomuchtalk) | servidor → cliente | event | `data_too_much_talk` | Anti-flood: mensagem descartada. |
| 112 | [`muted`](#muted) | servidor → cliente | event | `data_mute_notification` | Você está silenciado. |
| 113 | [`playerMute`](#playermute) | servidor → cliente | event | `data_player_mute` | Jogador silenciado/liberado por um admin. |
| 114 | [`playerKick`](#playerkick) | servidor → cliente | event | `data_player_kick` | Jogador expulso por um admin. |
| 115 | [`rankingUpdateFailed`](#rankingupdatefailed) | servidor → cliente | event | `data_ranking_update_failed` | Falha ao registrar o resultado no ranking. |
| 120 | [`lobbyState`](#lobbystate) | servidor → cliente | event | — (web, OG-252) | Estado do lobby da sala Ranked: fase, série, prazo, voto/"Pronto" de cada um e pedidos de troca de lado. |
| 121 | [`lobbyReady`](#lobbyready) | cliente → servidor | event | — (web, OG-254) | Marca ou desmarca "Pronto" no lobby Ranked. |
| 122 | [`lobbyVote`](#lobbyvote) | cliente → servidor | event | — (web, OG-254) | Voto de mapa no lobby Ranked (índice na rotação; −1 = nenhum). |
| 123 | [`lobbySide`](#lobbyside) | cliente → servidor | event | — (web, OG-253) | Troca de lado no lobby: sem alvo, vai para a vaga livre do outro lado; com alvo, pede para trocar com ele. |
| 124 | [`lobbySwapAnswer`](#lobbyswapanswer) | cliente → servidor | event | — (web, OG-253) | Resposta a um pedido de troca de lado. |
| 125 | [`playerClan`](#playerclan) | servidor → cliente | event | — (web, OG-206) | Tag do clã cadastrado de um jogador (logo depois do `playerJoined`; sem tag, não vem). |
| 126 | [`pauseState`](#pausestate) | servidor → cliente | event | — (web, OG-260) | Pausa do jogo Ranked: fase (sem pausa, pausado ou contagem de retomada), motivo (pedido do time, queda ou voto do bot substituto), time e quem pediu/caiu/saiu, segundos restantes (saldo do time, prazo de reconexão, voto ou contagem), o saldo de pausa de cada time e, no voto, os votos de cada opção. |
| 127 | [`pauseRequest`](#pauserequest) | cliente → servidor | event | — (web, OG-260) | Pede a pausa tática do time (on) ou a retomada (off); só no Ranked. |
| 128 | [`substituteVote`](#substitutevote) | cliente → servidor | event | — (web, OG-262) | Voto do time desfalcado: bot no lugar (bot) ou seguir com um a menos. |

## Campos

### hello

Código 1. Primeira mensagem do cliente: versão do protocolo e ticket da API (JWT).

- `protocol`: u16
- `ticket`: string (UTF-8, até 4096 bytes)
- `client`: string (UTF-8, até 64 bytes)

### welcome

Código 2. Aceito na sala: quem sou, mapa atual e placar.

- `protocol`: u16
- `pid`: pid (u8, 0..31)
- `color`: u8
- `maxPlayers`: u8
- `mode`: u8 enum: 0 = casual, 1 = ranked
- `mapIndex`: u16
- `redScore`: u32
- `blueScore`: u32

### reject

Código 3. Conexão recusada (a conexão é fechada em seguida).

- `reason`: u8 enum: 0 = serverFull, 1 = banned, 2 = passwordNeeded, 3 = wrongPassword, 4 = protocolMismatch, 5 = invalidTicket, 6 = rankedNeedsAccount, 7 = roomClosed
- `text`: string (UTF-8, até 256 bytes)

### disconnecting

Código 4. O servidor vai desconectar o jogador.

- `reason`: u8 enum: 0 = kick, 1 = idleKick, 2 = misbehavior, 3 = shutdown
- `seconds`: u16

### idleKickWarning

Código 5. Aviso de expulsão por inatividade.

- `seconds`: u16

### resumeToken

Código 7. Token para voltar à mesma vaga depois de uma queda de conexão (até 15 s).

- `token`: string (UTF-8, até 64 bytes)

### resume

Código 8. Junto com o `hello`: pede de volta a vaga deixada numa queda de conexão.

- `token`: string (UTF-8, até 64 bytes)

### serverSettings

Código 6. Configurações da sala: preset e gamemod completo (o cliente aplica com @outgun/settings).

- `preset`: string (UTF-8, até 32 bytes)
- `gamemod`: string (UTF-8, até 16384 bytes)
- `locked`: bool (u8 0/1)

### input

Código 10. Controles do frame; enviado a cada frame do cliente.

- `clientFrame`: u8
- `controls`: u8
- `gundir`: u16

### fire

Código 11. Botão de tiro pressionado ou solto.

- `on`: bool (u8 0/1)

### dropFlag

Código 12. Tecla de largar bandeira.

- `on`: bool (u8 0/1)

### suicide

Código 13. Suicídio.

Sem campos.

### changeTeam

Código 14. Quer trocar de time.

- `on`: bool (u8 0/1)

### mapExit

Código 15. Voto para sair do mapa.

- `on`: bool (u8 0/1)

### clientReady

Código 16. Cliente carregou o mapa e pode nascer.

Sem campos.

### mapVote

Código 17. Voto no próximo mapa (−1 = nenhum).

- `map`: i16

### negativeMapVotes

Código 18. Mapas que o jogador não quer.

- `maps`: lista (até 1024) de u16

### chat

Código 19. Mensagem de chat ou comando (/...).

- `text`: string (UTF-8, até 512 bytes)
- `teamOnly`: bool (u8 0/1)

### setName

Código 20. Troca de nome (convidados; contas usam o nome da conta).

- `name`: string (UTF-8, até 64 bytes)

### favoriteColors

Código 21. Cores preferidas, em ordem.

- `colors`: lista (até 16) de u8

### minimapBandwidth

Código 22. Jogadores no minimapa por frame.

- `playersPerFrame`: u8

### frame

Código 30. Estado do frame para um jogador: quem está na mesma sala, minimapa e o próprio estado.

- `frame`: u32
- `lastClientFrame`: u8
- `frameOffset`: u8
- `skipped`: bool (u8 0/1)
- `self`: opcional (u8 0/1) de próprio jogador
- `players`: lista (até 32) de jogador no frame
- `minimap`: lista (até 32) de posição no minimapa (`writeMinimapPlayerPosition`)
- `ping`: opcional (u8 0/1) de ping

### replayFrame

Código 31. Frame do replay (OG-090): todos os jogadores, de todas as salas, para um espectador onisciente.

- `frame`: u32
- `players`: lista (até 32) de jogador no replay

### spectatorStart

Código 32. Espectador ao vivo (OG-092): começa uma partida; em seguida vêm o estado inicial e os frames do replay, com o atraso da sala.

- `protocol`: u16
- `maxPlayers`: u8
- `delay`: u16
- `map`: string (UTF-8, até 64 bytes)
- `mapTitle`: string (UTF-8, até 64 bytes)

### playerJoined

Código 40. Jogador entrou na sala.

- `pid`: pid (u8, 0..31)
- `name`: string (UTF-8, até 64 bytes)
- `color`: u8
- `bot`: bool (u8 0/1)

### playerLeft

Código 41. Jogador saiu.

- `pid`: pid (u8, 0..31)

### playerName

Código 42. Nome de um jogador.

- `pid`: pid (u8, 0..31)
- `name`: string (UTF-8, até 64 bytes)

### playerInfo

Código 43. Cor, situação da conta e ranking de um jogador.

- `pid`: pid (u8, 0..31)
- `color`: u8
- `loggedIn`: bool (u8 0/1)
- `ranked`: bool (u8 0/1)
- `admin`: bool (u8 0/1)
- `rank`: u32
- `score`: i32
- `negScore`: i32
- `rankedPlayers`: u32

### teamChange

Código 44. Jogador mudou de pid/time (troca de times); `swappedColor` 255 se não foi troca.

- `from`: pid (u8, 0..31)
- `to`: pid (u8, 0..31)
- `color`: u8
- `swappedColor`: u8

### playersPresent

Código 45. Pids ocupados (ao entrar).

- `pids`: lista (até 32) de pid (u8, 0..31)

### accelerationModes

Código 46. Bit por pid: aceleração relativa à arma.

- `mask`: u32

### flagModes

Código 47. Locks e capturas em efeito (`flagModeMask`).

- `seeMinimapProperties`: u8
- `carryOwnTeamFlag`: bool (u8 0/1)
- `captureAwayFromBase`: bool (u8 0/1)
- `lockTeamFlags`: bool (u8 0/1)
- `lockWildFlags`: bool (u8 0/1)
- `captureOnTeamFlags`: bool (u8 0/1)
- `captureOnWildFlags`: bool (u8 0/1)

### minimapProperties

Código 48. Power-ups de jogadores vistos no minimapa.

- `players`: lista (até 32) de propriedades

### flagUpdate

Código 50. Estado de todas as bandeiras de um time.

- `team`: u8 enum: 0 = red, 1 = blue, 2 = wild
- `flags`: lista (até 64) de bandeira

### scoreUpdate

Código 51. Placar de um time.

- `team`: u8 enum: 0 = red, 1 = blue
- `score`: u32

### rocketFire

Código 52. Tiro: foguetes criados (o cliente os simula).

- `owner`: pid (u8, 0..31)
- `rockets`: lista (até 9) de u8
- `gundir`: u16
- `frame`: u32
- `power`: bool (u8 0/1)
- `roomX`: u8
- `roomY`: u8
- `x`: i16
- `y`: i16

### rocketVisible

Código 53. Foguete já em voo que entrou na visão.

- `rocket`: u8
- `team`: u8 enum: 0 = red, 1 = blue
- `power`: bool (u8 0/1)
- `gundir`: u16
- `frame`: u32
- `roomX`: u8
- `roomY`: u8
- `x`: i16
- `y`: i16

### rocketDelete

Código 54. Foguete removido (bateu); alvo 255 = parede.

- `rocket`: u8
- `target`: pid (u8, 255 = nenhum)
- `x`: i16
- `y`: i16

### powerCollision

Código 55. Atropelamento com power (efeito na sala).

- `pid`: pid (u8, 0..31)

### sound

Código 56. Som do servidor (código de amostra).

- `sample`: u8

### powerupVisible

Código 57. Power-up no chão.

- `id`: u8
- `kind`: u8 enum: 0 = shield, 1 = turbo, 2 = shadow, 3 = power, 4 = weapon, 5 = megahealth, 6 = deathbringer
- `roomX`: u8
- `roomY`: u8
- `x`: i16
- `y`: i16

### powerupPicked

Código 58. Power-up pego (some).

- `id`: u8

### powerupTimer

Código 59. Tempo restante de um power-up do jogador, em segundos.

- `kind`: u8 enum: 0 = shield, 1 = turbo, 2 = shadow, 3 = power, 4 = weapon, 5 = megahealth, 6 = deathbringer
- `seconds`: u16

### weaponChange

Código 60. Nível de arma do jogador.

- `level`: u8

### deathbringer

Código 61. Explosão de deathbringer.

- `team`: u8 enum: 0 = red, 1 = blue
- `frame`: u32
- `roomX`: u8
- `roomY`: u8
- `x`: i16
- `y`: i16

### frags

Código 62. Frags de um jogador.

- `pid`: pid (u8, 0..31)
- `frags`: i32

### kill

Código 63. Morte com atacante.

- `attacker`: pid (u8, 0..31)
- `target`: pid (u8, 0..31)
- `cause`: u8 enum: 0 = rocket, 1 = deathbringer, 2 = collision
- `carriedFlag`: u8 enum: 0 = none, 1 = own, 2 = enemy, 3 = wild
- `carrierDefended`: bool (u8 0/1)
- `flagDefended`: bool (u8 0/1)

### suicideEvent

Código 64. Suicídio.

- `pid`: pid (u8, 0..31)
- `carriedFlag`: u8 enum: 0 = none, 1 = own, 2 = enemy, 3 = wild

### capture

Código 65. Captura.

- `pid`: pid (u8, 0..31)
- `flagTeam`: u8 enum: 0 = red, 1 = blue, 2 = wild
- `assistant`: pid (u8, 255 = nenhum)

### flagTake

Código 66. Bandeira pega.

- `pid`: pid (u8, 0..31)
- `flag`: u8 enum: 0 = none, 1 = own, 2 = enemy, 3 = wild

### flagReturn

Código 67. Bandeira devolvida.

- `pid`: pid (u8, 0..31)

### flagDrop

Código 68. Bandeira largada de propósito ou entregue numa captura.

- `pid`: pid (u8, 0..31)
- `flag`: u8 enum: 0 = none, 1 = own, 2 = enemy, 3 = wild
- `captureDrop`: bool (u8 0/1)

### spawn

Código 69. Jogador nasceu.

- `pid`: pid (u8, 0..31)

### waitingTime

Código 70. Frames até poder nascer.

- `frames`: u32

### mapChange

Código 80. Novo mapa: o cliente baixa por HTTP se não tiver (CRC).

- `reason`: u8 enum: 0 = captureLimit, 1 = timeOut, 2 = vote, 3 = admin, 4 = other
- `mapIndex`: u16
- `file`: string (UTF-8, até 64 bytes)
- `title`: string (UTF-8, até 64 bytes)
- `crc`: u16

### mapChangeInfo

Código 81. Votos para trocar de mapa.

- `votes`: u8
- `needed`: u8
- `voteBlockSeconds`: u16

### worldReset

Código 82. Mundo reiniciado (antes do placar).

Sem campos.

### gameOver

Código 83. Mostra o placar de fim de partida.

- `reason`: u8 enum: 0 = captureLimit, 1 = timeOut, 2 = extraTimeOut
- `seconds`: u16

### startGame

Código 84. Partida começou.

Sem campos.

### mapTime

Código 85. Tempo de mapa e restante, em segundos.

- `elapsed`: u32
- `left`: u32

### timeEvent

Código 86. Avisos e fins de tempo.

- `kind`: u8 enum: 0 = fiveMinutesLeft, 1 = oneMinuteLeft, 2 = thirtySecondsLeft, 3 = timeOut, 4 = extraTimeOut, 5 = normalTimeOut, 6 = normalTimeOutSuddenDeath

### mapList

Código 87. Rotação de mapas (lista completa; `revision` muda a cada alteração).

- `revision`: u16
- `maps`: lista (até 1024) de mapa da rotação

### mapVotes

Código 88. Votos por mapa.

- `votes`: lista (até 1024) de u8

### currentMap

Código 89. Índice do mapa atual na rotação.

- `mapIndex`: u16

### brokenMap

Código 90. O mapa atual tem erro e será trocado.

Sem campos.

### stats

Código 100. Estatísticas de um jogador.

- `stats`: estatísticas do jogador (`data_stats`)
  - `pid`: pid (u8, 0..31)
  - `carriedFlag`: u8 enum: 0 = none, 1 = own, 2 = enemy, 3 = wild
  - `dead`: bool (u8 0/1)
  - `frags`: i32
  - `kills`: u32
  - `deaths`: u32
  - `consKills`: u32
  - `curConsKills`: u32
  - `consDeaths`: u32
  - `curConsDeaths`: u32
  - `suicides`: u32
  - `captures`: u32
  - `assists`: u32
  - `flagsTaken`: u32
  - `flagsDropped`: u32
  - `flagsReturned`: u32
  - `carriersKilled`: u32
  - `playtime`: u32
  - `lifetime`: u32
  - `flagCarryingTime`: u32

### movementShots

Código 101. Movimento e tiros de um jogador.

- `pid`: pid (u8, 0..31)
- `data`: movimento (px) e tiros
  - `movement`: u32
  - `shots`: u32
  - `hits`: u32
  - `shotsTaken`: u32

### teamMovementShots

Código 102. Movimento e tiros dos dois times.

- `red`: movimento (px) e tiros
  - `movement`: u32
  - `shots`: u32
  - `hits`: u32
  - `shotsTaken`: u32
- `blue`: movimento (px) e tiros
  - `movement`: u32
  - `shots`: u32
  - `hits`: u32
  - `shotsTaken`: u32

### teamStats

Código 103. Contadores de um time e capturas (tempo em s, capturador, assistente).

- `team`: u8 enum: 0 = red, 1 = blue
- `kills`: u32
- `deaths`: u32
- `suicides`: u32
- `flagsTaken`: u32
- `flagsDropped`: u32
- `flagsReturned`: u32
- `captures`: lista (até 1024) de captura

### statsReady

Código 104. Estatísticas finais enviadas (fim de partida).

Sem campos.

### text

Código 110. Texto para o jogador (chat, avisos do servidor).

- `kind`: u8 enum: 0 = normal, 1 = team, 2 = info, 3 = header, 4 = warning, 5 = server, 6 = admin
- `from`: pid (u8, 255 = nenhum)
- `text`: string (UTF-8, até 1024 bytes)

### tooMuchTalk

Código 111. Anti-flood: mensagem descartada.

Sem campos.

### muted

Código 112. Você está silenciado.

Sem campos.

### playerMute

Código 113. Jogador silenciado/liberado por um admin.

- `pid`: pid (u8, 0..31)
- `mode`: u8
- `admin`: string (UTF-8, até 64 bytes)

### playerKick

Código 114. Jogador expulso por um admin.

- `pid`: pid (u8, 0..31)
- `minutes`: u16
- `admin`: string (UTF-8, até 64 bytes)

### rankingUpdateFailed

Código 115. Falha ao registrar o resultado no ranking.

Sem campos.

### lobbyState

Código 120. Estado do lobby da sala Ranked: fase, série, prazo, voto/"Pronto" de cada um e pedidos de troca de lado.

- `phase`: u8 enum: 0 = lobby, 1 = vote, 2 = ready, 3 = countdown, 4 = game, 5 = finished
- `teamSize`: u8
- `bestOf`: u8
- `gameNo`: u8
- `seriesRed`: u8
- `seriesBlue`: u8
- `seconds`: u16
- `chosenMap`: i16
- `members`: lista (até 32) de membro do lobby
- `swaps`: lista (até 32) de pedido de troca de lado

### lobbyReady

Código 121. Marca ou desmarca "Pronto" no lobby Ranked.

- `ready`: bool (u8 0/1)

### lobbyVote

Código 122. Voto de mapa no lobby Ranked (índice na rotação; −1 = nenhum).

- `map`: i16

### lobbySide

Código 123. Troca de lado no lobby: sem alvo, vai para a vaga livre do outro lado; com alvo, pede para trocar com ele.

- `target`: pid (u8, 255 = nenhum)

### lobbySwapAnswer

Código 124. Resposta a um pedido de troca de lado.

- `from`: pid (u8, 0..31)
- `accept`: bool (u8 0/1)

### playerClan

Código 125. Tag do clã cadastrado de um jogador (logo depois do `playerJoined`; sem tag, não vem).

- `pid`: pid (u8, 0..31)
- `tag`: string (UTF-8, até 8 bytes)

### pauseState

Código 126. Pausa do jogo Ranked: fase (sem pausa, pausado ou contagem de retomada), motivo (pedido do time, queda ou voto do bot substituto), time e quem pediu/caiu/saiu, segundos restantes (saldo do time, prazo de reconexão, voto ou contagem), o saldo de pausa de cada time e, no voto, os votos de cada opção.

- `phase`: u8 enum: 0 = none, 1 = paused, 2 = resuming
- `reason`: u8 enum: 0 = team, 1 = drop, 2 = vote
- `team`: u8
- `by`: pid (u8, 255 = nenhum)
- `seconds`: u16
- `redSeconds`: u8
- `redRequests`: u8
- `blueSeconds`: u8
- `blueRequests`: u8
- `votesBot`: u8
- `votesShort`: u8

### pauseRequest

Código 127. Pede a pausa tática do time (on) ou a retomada (off); só no Ranked.

- `on`: bool (u8 0/1)

### substituteVote

Código 128. Voto do time desfalcado: bot no lugar (bot) ou seguir com um a menos.

- `bot`: bool (u8 0/1)

## Mensagens do original que não existem aqui

| Original | Motivo |
|---|---|
| data_file_request, data_file_download, data_file_ack | mapas e arquivos são baixados por HTTP com cache |
| data_old_registration_token, data_registration_token, data_registration_response, data_old_tournament_participation, data_ranking_participation | autenticação e ranking pela API (contas, OG-080+) |
| data_name_authentication_request | nomes protegidos são contas da API |
| data_negotiate_third_party_extensions, data_extension_advantage, faixa reservada | versão única do protocolo, negociada no hello |
| data_bot | incluído em playerJoined |
