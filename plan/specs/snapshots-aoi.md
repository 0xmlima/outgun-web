# Spec: snapshots por cliente e interesse por sala
Card(s): OG-042 · RNs: RN-VIS-01, RN-VIS-02, RN-VIS-03

## Resumo
O que o servidor original manda a cada jogador em cada frame (`broadcast_frame`) e quais eventos de foguetes e power-ups vão só para quem os vê. Isso define o que cada cliente pode saber: inimigos fora da sala e inimigos com shadow não aparecem, a não ser pelas regras do minimapa.

## Fonte
- `src/servnet.cpp:1937-2345` — `ServerNetworking::broadcast_frame`.
- `src/servnet.cpp:1927-1935` — `writeMinimapPlayerPosition`.
- `src/servnet.cpp:1802-1803` — `data_set_minimap_player_bandwidth` (jogadores do minimapa por frame que o cliente aceita).
- `src/servnet.cpp:3191-3260` — `sendOldRocketVisible`, `sendRocketDeletion`, `sendPowerupVisible`, `broadcastPowerupPicked` (só a quem está na sala).
- `src/world.cpp:836-847` — `remotelyVisibleProperties` (bits: deathbringer, shield, power, turbo, shadow, shadow < 10, sob efeito de deathbringer).
- `src/world.cpp:903` — `minimapPlayersPerFrame = 2` (default do cliente).
- `src/world.cpp:1905-1910,1940-1956,1995-2008,2038-2046` — power-up visível ao renascer o jogador, ao cair de quem morreu, ao reaparecer; pego (para a sala).
- `src/world.cpp:2212-2226` — `game_player_screen_change`: ao trocar de sala, o jogador recebe os power-ups e os foguetes já em voo daquela sala.
- `src/world.cpp:2365-2376` — ao sair, foguetes do jogador são apagados (alvo 255).
- `src/world.cpp:2414-2451` — `doesPlayerSeeRocket` (distância em salas ≤ `see_rockets_distance`) e `shootRockets` (lista de quem vê o tiro, `vislist`).
- `src/world.cpp:2506-2538` — parede e fora do mapa não geram mensagem (o cliente simula); acerto em jogador gera `rocket_delete` com o alvo (252 = tinha escudo, não pisca).
- `src/world.cpp:3635-3637` — `seesPropertiesRemotely` (`see_minimap_player_properties`: 0 ninguém, 1 aliados, 2 todos).

## Settings
| Nome | Faixa | Default código | Clássico | Uso |
|---|---|---|---|---|
| `minimap_send_limit` | 0–32 | 32 | 32 | Máximo de jogadores do minimapa por frame |
| `see_rockets_distance` | ≥ 0 salas | 0 | 0 | Até que distância (em salas, Manhattan com volta) um jogador recebe tiros |
| `always_send_flag_location` | bool | 0 | 0 | Portador de bandeira sempre visível no minimapa do outro time |
| `shadow_see_shadow` (`pup_shadow_invisibility`...) | bool | — | — | Com shadow, vê inimigos com shadow |
| `see_minimap_player_properties` | 0–2 | 0 | 0 | Quem recebe os power-ups dos jogadores do minimapa |
| Cliente: jogadores do minimapa por frame | 0–32 | 2 | 2 | `minimapBandwidth` |

## Algoritmo (por frame)
1. **Visão de minimapa por time** `t` (máscaras de 32 bits):
   - `normal[t]`: cada aliado vivo; e cada inimigo vivo na mesma sala de um aliado vivo se o inimigo tem `visibility > 10` ou carrega bandeira; ou, com `always_send_flag_location`, qualquer inimigo vivo com bandeira.
   - `shadow[t]`: inimigos vivos sem shadow (ou com bandeira, ou qualquer um com `shadow_see_shadow`), unido a `normal[t]`.
   - Portador de bandeira de `t` entra nas duas máscaras do outro time.
2. **Para cada destinatário `i`** (jogadores ativos):
   - cabeçalho: frame, último frame do cliente, deslocamento, `skipped` (cliente carregando mapa ou fim de partida);
   - se não pulado: **jogadores da mesma sala**, exceto inimigo com `visibility == 0` sem bandeira (a não ser que `i` tenha shadow e `shadow_see_shadow`, quando o inimigo aparece com alfa ≥ 128). Para cada um: posição, velocidade (vivo), bits (morto, deathbringer, afetado, escudo, turbo, power), controles (0 se morto), direção da arma, visibilidade (spawn protegido pisca 128/220);
   - as propriedades desses jogadores passam a ser "conhecidas" por `i`;
   - **minimapa**: `P = (i com shadow ? shadow : normal)[time de i]` menos quem está na sala de `i`; manda até `min(minimap_send_limit, banda do cliente)` jogadores, em rodízio a partir de `nextMinimapPlayer[i]` (o original arredonda o ponto de partida para múltiplos de 4 e codifica a máscara em bits; aqui vai a lista). Posição no minimapa: `sala·⌊255/w⌋ + ⌊⌊255/w⌋·(x − 1e−5)/472⌋` (idem y);
   - para cada jogador do minimapa cujas propriedades `i` pode ver (`seesPropertiesRemotely`) e que mudaram desde o último envio: evento `minimapProperties`;
   - vida e energia próprias;
   - ping do jogador `frame % maxplayers`, se existir.
3. **Eventos só para quem vê:**
   - tiro (`rocketFire`): destinatários = `doesPlayerSeeRocket` (distância de sala ≤ `see_rockets_distance`); a lista fica com o foguete (`vislist`);
   - foguete removido por acerto ou saída do dono (`rocketDelete`): para a `vislist`;
   - troca de sala (ou renascer): o jogador recebe `powerupVisible` dos power-ups da nova sala e `rocketVisible` dos foguetes que ainda não conhecia e agora vê (entra na `vislist`);
   - power-up que aparece (reaparecimento ou caiu de quem morreu): `powerupVisible` para quem está na sala;
   - power-up pego: `powerupPicked` para quem está na sala (não quando um aliado "pega junto").

## Divergências intencionais
1. Posições em `f32` em vez de 12 bits por eixo e velocidade em `SignedByteFloat` (decidido no OG-041); a máscara do minimapa vai como lista de pids (mesmo conteúdo).
2. O rodízio do minimapa começa no próximo jogador da máscara, sem o arredondamento para múltiplos de 4 do original (era só para compactar a máscara em bits).
3. Sem o código 252 de `rocketDelete` ("acertou mas tinha escudo, não pisca"): o alvo vai sempre, e o cliente decide o pisca pelo escudo que já conhece do frame.
4. O frame de quem está carregando o mapa ou no placar vai só com o cabeçalho, como no original; nada de mapas ou estatísticas no frame (vão por eventos: OG-045/066).
Registrado em PLAN seção 12 (D-16).

## Casos de borda
1. Inimigo com shadow total (0) na mesma sala: não vai, a não ser que carregue bandeira.
2. Aliado com shadow: sempre vai (só inimigos são filtrados).
3. Jogador morto: vai na mesma sala (o cliente desenha o corpo), sem controles; mortos não entram no minimapa.
4. Minimapa com limite 0: lista vazia.
5. Destinatário com shadow e `shadow_see_shadow`: vê inimigos com shadow na sala com alfa ≥ 128.
6. Dono sai do jogo: seus foguetes são apagados para quem os via.

## Vetores de teste
- 2 jogadores de times diferentes em salas diferentes: nenhum aparece no frame do outro; no minimapa, só se um aliado vê.
- Inimigo com `visibility` 0 na mesma sala: fora do frame; com bandeira: dentro.
- Minimapa com 6 aliados e banda 2: três frames seguidos mandam {a,b}, {c,d}, {e,f}.
- Tráfego: 32 jogadores, 10 frames/s, média < 10 KB/s por cliente.
