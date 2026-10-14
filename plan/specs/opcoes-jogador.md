# Spec: opções do jogador
Card(s): OG-068 (e OG-070 para as gráficas avançadas) · RNs: RN-NOM-01, RN-TIM-05

## Resumo
O menu "Options" do original (`Menu_options`) reúne as opções do jogador, do jogo, mensagens
rápidas, controles, modo de tela, tema e fonte, gráficos, sons, idioma e relatório de bugs. A web
mantém a mesma estrutura de submenus, com as opções que fazem sentido no navegador; as opções
ficam no navegador (convidado) e também na conta (logado).

## Fonte
- `config/client.cfg` + `src/client_menus.h` (`enum ClientCfgSetting`, base 0) — valores distribuídos.
- `src/client_menus.h:172-415`, `src/client_menus.cpp:210-760` — `Menu_player`, `Menu_game`, `Menu_controls`, `Menu_screenMode`, `Menu_theme`, `Menu_graphics`, `Menu_sounds`, `Menu_language`, `Menu_quickMessages`, `Menu_bugReportPolicy`, `Menu_options`: rótulos, faixas e defaults.
- `src/menu.cpp:677-692` — `Colorselect::handleKey`: ←/→ escolhe; Ctrl+←/→ (ou `+`/`-`) troca a cor de lugar.
- `src/guiclient.cpp:555-563` — as 16 cores sempre na lista: as favoritas salvas primeiro, depois as que faltam em ordem.
- `src/guiclient.cpp:743-777` — `sendFavoriteColors` (lista inteira, em ordem) e `sendMinimapBandwidth` (`cps / 20` jogadores por frame) ao conectar; favoritas não vão se "Use random color" estiver marcado.
- `src/guiclient.cpp:1795-1905` — `netKill`, `netSuicide`, `netFlagTake/Return/Drop`: quais mensagens dependem de `showKillMessages` e `showFlagMessages`. `src/clientbase.cpp:1030-1040` — captura sempre aparece.
- `src/guiclient.cpp:2553-2566` — mensagens rápidas: Alt+1..9, Alt+0 = 10ª; só com a linha de chat vazia; "Send message immediately" envia, senão põe o texto na linha para editar.

## Inventário (default do original → web)
| Menu | Opção | Default (código / `client.cfg` distribuído) | Web |
|---|---|---|---|
| Player | Name (15) | `""` | ✅ nome do convidado (com conta: nome da conta, troca em Conta) |
| Player | Get random name | — | ❌ removida (nome de convidado é livre; conta tem nome próprio) |
| Player | Favorite colors | 0..15 | ✅ 16 cores em ordem; Ctrl+←/→ reordena; enviadas ao entrar e ao mudar |
| Player | Use random color | não | ✅ não envia as favoritas (o servidor sorteia) |
| Player | Ranking password / Registration status | — | ❌ substituídas pela conta (D-10, RN-PLT-01); status = "logado como X" |
| Player | Take part in the ranking | sim / não | ✅ só com conta (`PUT /account/ranking`, OG-084); padrão sim |
| Player | Remove server-specific player passwords | — | ❌ não existe senha por servidor |
| Game | Lag prediction / amount | não / 10 | ✅ (web liga por padrão, D-18) |
| Game | Bandwidth for out-of-room players (cps) | 80 (0..640, passo 20) | ✅ `minimapBandwidth` = cps/20 ao entrar e ao mudar |
| Game | Save game messages | off | ❌ removida (sem arquivos locais) |
| Game | Show flag messages | sim | ✅ |
| Game | Show killing messages | não / **sim** | ✅ padrão sim, como o `client.cfg` distribuído (visão original, D-05) |
| Game | Save game / replay statistics | não | ❌ removidas (o perfil guarda as partidas, OG-085) |
| Game | Show stats after the round | off | ✅ preferência; a tela é do OG-066 |
| Game | Show server info when connected | não | ✅ preferência; a tela (F5) é do OG-066 |
| Game | Stay dead when in a menu at round start | sim | ✅ OG-070 (o `clientReady` espera o menu do jogo fechar; spec opcoes-graficas.md) |
| Game | Skip maps in rotation | dimmed | ✅ preferência; a lista de mapas (F2) é do OG-066 |
| Game | Underline master/server-authenticated players | sim / não | ✅ OG-070 (sublinha quem tem conta; o de servidor não existe na web) |
| Game | Get server list at startup | sim | ❌ removida (o lobby é sempre ao vivo) |
| Quick messages | Enable / Send immediately / Alt+1..0 (30) | não / não / vazias | ✅ |
| Controls | teclas, mouse | — | ✅ OG-063 (D-15) |
| Controls | Keyboard layout | — | ❌ o navegador já entrega o layout |
| Controls | Joystick (Allegro) | — | ❌ trocado pelo gamepad do navegador (D-15) |
| Screen mode | resolução, cores, janela, flipping | — | ❌ removido (navegador; modo foco/tela cheia D-15) |
| Theme | Theme | — / sem tema | ✅ |
| Theme | Background theme / Prefer main theme background | `<no background>` / sim | ✅ OG-070 (fundo da tela fora das salas, em mosaico; só o tema Metal tem) |
| Theme | Colour theme / Prefer main theme colours | — / sim | ✅ |
| Theme | Font | — | ✅ |
| Graphics | Rooms on screen in game | 2 (1..20) | ✅ (web: 1, `client.cfg` distribuído, D-05) |
| Graphics | Continuous textures | sim | ✅ |
| Graphics | Show player names | never / never | ✅ never / in same room / always; padrão web **in same room** (D-26) |
| Graphics | FPS limit | 60 (1..10000) | ✅ |
| Graphics | Scrolling, Less transparency, Disappeared players on minimap, Highlight returned flags, Extra-visible flags, Flag disappearance positions, Highlight self after spawn, Neighbor markers, Box visible area, View over border, Repeat map, Highlight unknown maps, Stats screen alpha, Map info mode | vários | ✅ OG-070 (spec `opcoes-graficas.md`); Antialiasing não se aplica (o navegador sempre suaviza); Rooms in replay fica com o player (OG-091) |
| Sounds | Enabled / Volume / Theme | sim / 128 / — | ✅ |
| Language | idiomas do catálogo | — | ✅ |
| Bug report policy | — | — | ❌ removido |

## Algoritmo
- Favoritas: lista das 16 cores; a salva vem primeiro, as que faltam são acrescentadas em ordem crescente (corrige lista salva incompleta ou repetida). Ao entrar na sala e a cada mudança: `favoriteColors{colors}` (se "random" desligado); `minimapBandwidth{playersPerFrame: cps/20}`.
- Mensagens no feed: `showKillMessages` controla a morte, "killing spree" (início e fim, inclusive por suicídio); `showFlagMessages` controla LOST (morte e suicídio), GOT, RETURNED e DROPPED. CAPTURED e as demais aparecem sempre.
- Mensagem rápida: com o chat vazio e a opção ligada, Alt+N (N = 1..9, 0 = 10ª) com texto não vazio: envia na hora (como Enter) ou põe o texto na linha de chat.
- Cores: com "Prefer main theme colours" marcado e o tema principal tendo `colours.txt`, valem as dele; senão as do tema de cores escolhido; sem nenhum, as de fábrica (`colour_def.inc`).

## Divergências intencionais
- **D-26**: "Show player names" vem `never` no código e no `client.cfg` distribuído (Ctrl+F3 alterna); a web usa "in same room" por padrão para que se saiba com quem se joga numa sala pública.
- Opções sincronizadas na conta (`GET|PUT /account/settings`): ao entrar, as da conta valem; mudanças são gravadas na conta (debounce de 1 s). Convidado: só no navegador.
- Removidas: ver ❌ no inventário (dependem de arquivos locais, do master server, do modo de vídeo da Allegro ou do relatório de bugs).

## Casos de borda
1. Lista de favoritas salva com cor repetida ou fora de 0..15: descartada, completada com as que faltam.
2. Mensagem rápida com o chat já sendo digitado: Alt+N não faz nada.
3. Mudar as favoritas no meio da partida: enviadas na hora (o servidor recalcula a cor, RN-TIM-05).
4. Nome do convidado vazio: entra como "Convidado".
