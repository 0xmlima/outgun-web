# Spec: entrada (teclado, gamepad) e teclas de jogo
Card(s): OG-063 · RNs: RN-TIR-10

## Resumo
Como o cliente original lê os controles do jogador (movimento, tiro, corrida, esquiva) e as teclas de ação, e como a versão web faz o mesmo no navegador com remapeamento e gamepad.

## Fonte
- `src/commont.cpp:59-92` — `ClientControls::fromKeyboard`: setas, teclado numérico (8/2/5/4/6 e diagonais 7/9/1/3), Shift = correr, Alt/Alt Gr = esquivar.
- `src/commont.cpp:94-115` — `ClientControls::fromJoystick`: eixo 0 = esquerda/direita, eixo 1 = cima/baixo, botões de correr e esquivar.
- `src/guiclient.cpp:1091-1110` — `readControls`, `readControlsInGame` (setas reservadas em telas de estatística; `clearModifiersIfIdle`).
- `src/guiclient.cpp:1112-1120` — `firePressed`: Ctrl esquerdo ou direito, botão do joystick ou do mouse.
- `src/guiclient.cpp:2610-2690` — teclas de ação: Delete = suicídio, Ctrl+End = pedir troca de time (liga/desliga), Insert = mais mensagens, Tab, F-keys; Page Down segurado = largar bandeira (`2778`).
- `src/client_menus.cpp:301-330` — defaults de `Menu_controls`: teclado numérico ligado, joystick desligado, botões 1 (tiro), 2 (correr), 3 (esquiva).
- `doc/game.html` — "Key summary".

## Ações e teclas padrão
| Ação | Original | Web (padrão "Clássico") | Tipo |
|---|---|---|---|
| Mover | Setas, teclado numérico | Setas, Numpad 8/2/5/4/6/7/9/1/3 | segurada |
| Atirar | Ctrl | Ctrl esquerdo/direito | segurada |
| Correr | Shift | Shift esquerdo/direito | segurada |
| Esquivar (strafe) | Alt, Alt Gr | Alt esquerdo/direito | segurada |
| Largar bandeira | Page Down | Page Down | segurada |
| Suicídio | Delete | Delete | toque |
| Trocar de time | Ctrl+End | Ctrl+End | toque (liga/desliga o pedido) |
| Lista de mapas / votar troca | F2 / F8 | F2 / F8 | toque |
| Ajuda, estatísticas de time, de jogadores, servidor | F1, F3, F4, F5 | F1, F3, F4, F5 | toque |
| Mais mensagens | Insert | Insert | toque |
| Pings | Tab | Tab | segurada |
| Nomes / som | Ctrl+N / Ctrl+M | Ctrl+N e F6 / Ctrl+M | toque |
| Captura de tela | F11 | F9 (F11 é tela cheia no navegador) | toque |
| Ampliar área de jogo | F12 | F12 não (ferramentas do navegador); fica no menu | — |
| Menu | Esc | Esc | toque |

Gamepad (API Gamepad, layout "standard"): analógico esquerdo ou direcional = mover (limiar 0,5), botão 0 = atirar, 1 = correr, 2 = esquivar, como os botões 1/2/3 do joystick do original; Start (9) = menu.

## Algoritmo
1. Bits de movimento = união de teclado (setas + numpad) e gamepad, como `fromKeyboard | fromJoystick`.
2. `clearModifiersIfIdle`: sem direção, correr e esquivar são zerados (já na sim, `controls.ts`).
3. Tiro = qualquer tecla/botão de tiro pressionado.
4. Uma tecla com modificador (ex.: Ctrl+End) só casa com o modificador; uma tecla sem modificador casa com ou sem (Delete com Ctrl segurado, atirando, ainda é suicídio, como no original, que olha só `KEY_DEL`).
5. Ao perder o foco (troca de aba), todas as teclas são soltas.

## Conflitos com o navegador
- O jogo chama `preventDefault` nas teclas que usa: Ctrl+setas, Alt+setas (voltar/avançar no Chrome), Alt sozinho (barra de menus no Windows/Firefox), Tab, F-keys usadas, Page Down, espaço.
- **Não dá para impedir fora de tela cheia:** Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab, Ctrl+Shift+W. Mitigações:
  1. **Modo foco** (opção): tela cheia + `navigator.keyboard.lock()` (Chrome/Edge), que captura também esses atalhos; ponteiro escondido;
  2. confirmação ao fechar a aba durante a partida (`beforeunload`), para um Ctrl+W acidental com o tiro apertado;
  3. Ctrl+N (nomes) tem a alternativa F6.
- Esquema alternativo "Navegador" (opção): Espaço atira, Z corre, X esquiva; sem Ctrl/Alt.

## Divergências intencionais
1. Remapeamento de todas as ações e gamepad padrão (o original só tinha joystick e escolha de layout de teclado).
2. Teclas por posição física (`KeyboardEvent.code`), que independem do layout do teclado (o original tinha a opção de layout).
3. Captura de tela em F9 (F11 é a tela cheia do navegador); F12 sem uso.
4. Mira com mouse (`aimMode` do original) fica fora da v1.
Registrado em PLAN seção 12 (D-15).

## Vetores de teste
- Numpad7 → cima + esquerda; Numpad5 → baixo (como o original).
- Shift + seta direita → direita + correr; Alt sozinho → nada (modificador sem direção é limpo).
- Ctrl+End com o Ctrl esquerdo segurado → troca de time; End sozinho → nada.
- Delete com Ctrl segurado → suicídio.

## v2: envio por evento e tolerância de diagonal (S39)
- **OG-371:** cada tecla do jogo apertada ou solta chama a leitura e o envio na hora (`GameInput.onChange`); o timer de 10 Hz continua com o batimento e o gamepad.
- **OG-372 (D-72):** `ChordFilter` (`apps/web/src/game/input/chord.ts`). Um estado que viraria a arma (direção nova sem strafe) sai com strafe provisório durante a janela (padrão 30 ms, opção 0–60 em Controles); Alt, soltar tudo ou a mesma direção fecham a janela sem virar; no fim dela a arma vira; o tiro vira a arma antes de sair. Vale para teclado e gamepad. O servidor não muda.
