# Spec: predição, reconciliação e suavização no cliente
Card(s): OG-064 · RNs: —

## Resumo
Como o cliente original transforma os frames de 10 Hz do servidor no que aparece na tela: guarda o último frame (`fx`), avança os foguetes por conta própria, e a cada quadro de desenho copia `fx` para `fd` e extrapola o mundo inteiro até "agora" (e, com a predição de lag ligada, até o momento em que os controles ainda não confirmados chegam ao servidor). O envio dos controles é sincronizado com o frame do servidor pelo `frameOffset`.

## Fonte
- `src/clientbase.h:88-96` — `clFrameSent`, `clFrameWorld`, `averageLag`, `frameReceiveTime`, `controlHistory[256]`, `svFrameHistory[256]`, `netsendAdjustment`.
- `src/clientbase.h:249-266` — `ClientPhysicsCallbacks`: sem colisão com foguetes, jogadores colidem entre si, sem troca de sala, sem distância percorrida.
- `src/clientbase.cpp:419-460` — `process_live_frame_data`: frame mais velho é ignorado; `rocketFrameAdvance(svframe − fx.frame)`; `frameReceiveTime`; `currentLag = bound(svframe − 0,5 − svFrameHistory[clFrameWorld], 0, 50)`, `averageLag = 0,99·averageLag + 0,01·currentLag`; `offsetDelta = frameOffset/256 − 0,5`, média de 10 frames → `netsendAdjustment = −média·0,1 s`.
- `src/clientbase.cpp:730-800` — `data_rocket_fire` / `data_old_rocket_visible`: `shootRockets(..., frameAdvance = fx.frame − frameno, ...)` (o cliente cria os foguetes já avançados); `data_rocket_delete` apaga e faz o alvo piscar 0,3 s.
- `src/world.cpp:3052-3066` — `rocketFrameAdvance`: foguetes andam `n` frames; parede → `rocketHitWall` (efeito), fora do mapa → remove.
- `src/world.cpp:3696-3750` — `ClientWorld::extrapolate`: copia jogadores visíveis e o próprio, foguetes; um `applyPhysics` de frame inteiro para cada controle do histórico entre `ctrlFirst` e `ctrlLast` (exclusive) e um de `subFrameAfter` com `ctrlLast`; raio `PLAYER_RADIUS − plw/0xFFF/2` (folga para a posição quantizada).
- `src/guiclient.cpp:1155-1167` — `send_frame`: num frame novo `++clFrameSent`, `controlHistory[clFrameSent] = controles`, `svFrameHistory[clFrameSent] = fx.frame + (agora − frameReceiveTime)·10`; mudança de tecla no meio do frame reenvia com o mesmo número se ainda deve chegar no mesmo frame do servidor.
- `src/guiclient.cpp:2812-2819` — envio a 10 Hz: `nextSend += 0,1 + netsendAdjustment`; atrasado, não acumula.
- `src/guiclient.cpp:2857-2896` — extrapolação de desenho: com predição, `lagWanted = 2·(1 − amount/10)`, `timeDelta = max(0, averageLag − lagWanted) + (agora − frameReceiveTime)·10`; consome frames inteiros do histórico de `clFrameWorld+1` até `clFrameSent` enquanto `timeDelta > 1`; `timeDelta ≤ 3`; direção da arma (8 direções) = última direção sem strafe do histórico. Sem predição: só `(agora − frameReceiveTime)·10` com os controles de `clFrameWorld`.
- `src/servnet.cpp:1840-1843, 2073, 2342` — `frameOffset = 10·(agora − frameSentTime)` na chegada de um frame novo do cliente; enviado como `bound(offset, 0, 0,999)·256`.
- `src/client_menus.cpp:243-244` — opções "Lag prediction" (padrão desligado) e "Lag prediction amount" 0..10 (padrão 10); `config/client.cfg` distribuído: `4 0`, `5 10`.

## Algoritmo (versão web)
1. **Envio** (timer de 100 ms, não `requestAnimationFrame`): `clFrameSent++`, guarda controles e `svFrameHistory`, manda `input`. O próximo envio é `+100 ms + netsendAdjustment`; atrasado, não acumula. Controles que mudam entre envios são reenviados com o mesmo número se ainda devem chegar no mesmo frame do servidor (`agora_em_frames < svFrameHistory[clFrameSent] + 0,5`), atualizando o histórico.
2. **Frame recebido** (`frame`): ignora se `frame < fx.frame`; avança foguetes `frame − fx.frame` frames; guarda `frameReceiveTime`; `clFrameWorld = lastClientFrame`; atualiza `averageLag` (a primeira amostra inicializa a média) e o ajuste de envio; aplica jogadores (visíveis), próprio estado exato (`self`: posição, velocidade, vida, energia).
3. **Desenho** (cada quadro do navegador): `fd = cópia(fx)`; para o próprio jogador, aplica os controles de `clFrameWorld+1..` como no original e a fração final; todos os outros jogadores andam com os últimos controles conhecidos (dead reckoning), foguetes com a velocidade; `timeDelta ≤ 3` frames.
4. **Suavização (divergência)**: ao chegar um frame, a diferença entre a posição desenhada no quadro anterior e a nova extrapolação vira um deslocamento visual que decai exponencialmente (meia-vida de 50 ms). Saltos maiores que 48 px (renascer, troca de sala, colisão) não são suavizados.
5. **Correção de predição** (métrica): ao chegar um frame, se a posição prevista do próprio jogador para o mesmo instante muda mais de 1 px, conta-se uma correção.

## Divergências intencionais
1. **Predição ligada por padrão** com quantidade 10 (o original vem desligado): o card pede resposta imediata com 100 ms de latência. A opção continua no menu; a quantidade 0..10 é o "handicap" de lag do original (`lagWanted`).
2. **Suavização visual das correções** (item 4); o original troca de posição de uma vez.
3. **Troca de sala liberada no cliente** para o próprio jogador previsto (o original não troca: com 1 sala na tela e sem rolagem, a nave sairia da tela até a resposta do servidor).
4. `averageLag` começa na primeira medida em vez de 0 (com média de 0,99 levaria ~10 s para convergir).
5. O raio reduzido `PLAYER_RADIUS − plw/0xFFF/2` não é usado: as posições vão em `f32` (D-16), não em 12 bits.
6. Sem o filtro de 20 ms ao soltar uma das teclas de uma diagonal (`keyFilterTimeout`); o reenvio no meio do frame é limitado a um por número de frame (cabe no limite de taxa do OG-043).
Registrado em PLAN seção 12 (D-18).

## Casos de borda
1. Frame atrasado ou duplicado (número menor que o atual): ignorado.
2. Frame `skipped` (carregando mapa, placar): nada a extrapolar; o desenho fica parado.
3. Morto: sem controles; a arma não gira.
4. Contador de 8 bits dá a volta no histórico (255 → 0): a sequência continua.
5. Nenhum input confirmado ainda (`clFrameSent == clFrameWorld`): extrapola só o tempo desde o frame.
6. Aba em segundo plano: o navegador segura timers; ao voltar, o envio não manda rajada (não acumula) e a extrapolação limita-se a 3 frames.

## Vetores de teste
- Sem latência e sem perda: posição prevista = posição do servidor no frame seguinte (0 correções).
- 150 ms de RTT, 2% de perda (retransmissão segura o fluxo por mais um RTT), controles mudando a cada 0,5–2 s: menos de 1 correção por segundo em média; nenhum salto desenhado acima de 8 px entre quadros a 60 fps em movimento normal.
- `frameOffset` converge para ~0,5 frame em poucos segundos com latência constante.
