# Spec: áudio
Card(s): OG-067 · RNs: —

## Resumo
Quais sons o original toca e quando: os que o cliente decide a partir das mensagens e da própria simulação (tiro, acerto, mortes, bandeiras, chat, avisos) e os "de sala" que o servidor manda só para quem está na sala do jogador (power-ups, escudo, deathbringer). Cada sample toca uma voz só: tocar de novo interrompe a anterior.

## Fonte
- `src/commont.h:328-380` — `SAMPLE_*` (a ordem é o código da mensagem `data_sound`).
- `src/sounds.cpp:130-173` — arquivo de cada sample no tema (`fire`, `hit`, `wallhit`... `spree`, `colldam`); `:207-214` — `Sounds::play`: para o sample se ele estiver tocando e toca de novo (volume 0..255, centro, frequência 1000 = normal).
- `src/client_menus.cpp:602-603` — "Sounds enabled" (ligado) e "Volume" (0..255, padrão 128, passo 15).
- `src/servnet.cpp:367-372` — `broadcast_screen_sample`: a mensagem vai para quem está na sala do jogador.
- `src/world.cpp:2081-2155` — ao pegar: `shieldp`, `speedon`, `helmon`, `quadon`, `weaponup`, `megaheal`, `getdb`; `:2195-2204` — ao largar o pior power-up: `getdb` (deathbringer) ou `shieldl`; `:2285-2302` — dano com escudo: `shieldl` (escudo acabou) ou `shieldd` (não com deathbringer); `:2570-2635` — colisões: shadow compartilhado (`helmon` para quem recebe), infecção de deathbringer (`hitdb`), dois escudos (`shieldl`); `:3135-3150` — fim de turbo/power/shadow (`speedoff`, `quadoff`, `helmoff`); `:3494` — atingido pela explosão de deathbringer (`hitdb`).
- `src/guiclient.cpp:1454-1470` — tiro na sala atual (`fire`/`quadfire`), acerto na sala atual (`hit`), atropelamento com power (`colldam`, ou `hit` se o tema não tem).
- `src/guiclient.cpp:1686, 1732, 1784-1950` — chat (`talk`), fim de partida (`gameover`), mortes de quem está na tela (`death1`/`death2` ao acaso, `diedb` por deathbringer), bandeira perdida/largada (`lost`), início de sequência do próprio jogador (`spree`), devolução (`return`), troca de time (`chanteam`).
- `src/clientbase.cpp:615, 720, 960, 1041, 1200, 1397, 1403` — entrou (`entergam`), bandeira passou a ser carregada (`got`), explosão de deathbringer (`usedb`), captura (`capture`), saiu (`leftgam`), 5 min e 1 min (`5_min`, `1_min`).
- `src/guiclient.cpp:3320-3355` — callbacks de física: foguete na parede na sala atual (`wallhit`/`qwallhit`), quique na parede (`wabounce`) e entre jogadores (`plbounce`), no máximo um a cada 0,2 s por jogador.

## Regras da versão web
1. Samples do tema "Visa" (o único do original), decodificados uma vez (samples redirecionados compartilham o arquivo); os que o tema não tem (`wallhit`, `qwallhit`, `colldam`) ficam mudos, como no original.
2. Web Audio com `latencyHint: 'interactive'`; o som começa no instante em que o evento é tratado.
3. O contexto de áudio é liberado no primeiro gesto (tecla ou clique) se o navegador o criar suspenso.
4. Ctrl+M (ação "Toggle sound") liga e desliga e grava a preferência; "Sounds enabled" e "Volume" nas Opções.

## Divergências intencionais
Nenhuma.

## Casos de borda
1. Mesmo sample duas vezes seguidas: a segunda corta a primeira.
2. A extrapolação refaz a física a cada quadro: o intervalo de 0,2 s por jogador evita repetir o quique.
3. Morte de quem não está na tela: só a mensagem, sem som.

## Vetores de teste
- `sound` com o código de `speedon` → toca `speedon`.
- Morte por foguete de quem está na tela com bandeira → `death1`/`death2` e `lost`.
- Quique na parede em 10,0 s e 10,1 s → um som; em 10,3 s → outro.
