# OG-063 — Input: teclado, remapeamento e gamepad

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S6 |
| Status | Concluído |
| Dependências | [OG-060](OG-060-web-shell.md) |
| Regras de negócio | RN-TIR-10 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero os controles do original (setas, Ctrl atira, Shift corre, Alt strafe) e poder remapear tudo.

## Contexto e referências no original
- `doc/game.html` (Key summary).
- `keyboard.dat`, `Menu_controls` (`client_menus.h:229`).
- Teclas: Delete suicídio, Page Down larga bandeira, Ctrl+End troca time, F1–F12.

## Escopo
- Mapa de teclas padrão do original; remapeamento persistido.
- Gamepad API.
- Evitar conflitos de atalhos do navegador (Ctrl+W etc.) — alternativas documentadas.
- Modo foco (pointer lock opcional).

## Critérios de aceite
- [x] Todas as ações do Key summary funcionam.
- [x] Ctrl/Alt não disparam atalhos do navegador durante o jogo (ou têm alternativa padrão).

## Notas técnicas
- Alt e Ctrl têm comportamento especial no navegador; considerar padrão alternativo (ex. Espaço atira) mantendo o clássico como opção.

## Notas de implementação
- **Spec:** [`plan/specs/entrada.md`](../specs/entrada.md): `ClientControls::fromKeyboard/fromJoystick`, `firePressed`, teclas de ação do `guiclient.cpp` e defaults do `Menu_controls`.
- **Código (`apps/web/src/game/input/`):**
  - `bindings.ts`: ações seguradas (mover, atirar, correr, esquivar, largar bandeira, pings) e de toque (suicídio, troca de time, F1–F5, F8, Insert, nomes, som, captura, modo foco); esquemas **Clássico** (teclas do original, com teclado numérico e diagonais) e **Navegador** (Espaço/Z/X, sem Ctrl/Alt). Acordes com modificador casam exatos; sem modificador, casam com qualquer um (Delete com o Ctrl do tiro segurado ainda é suicídio, como no original). `rebind` sem duplicar teclas (as diagonais do teclado numérico ficam nas duas direções); persistência tolerante a dados inválidos;
  - `input.ts`: `GameInput` (teclado + gamepads, `preventDefault` nas teclas do jogo e em Ctrl/Alt+setas, Alt solto, solta tudo ao perder o foco ou abrir o menu) e o modo foco (`toggleFocusMode`: tela cheia + `navigator.keyboard.lock()` + ponteiro escondido).
- **Tela Opções → Controles** (`ControlsScreen.tsx`): esquema, lista de ações com as teclas, Enter acrescenta uma tecla (captura com modificadores; modificador sozinho é gravado ao soltar), Delete volta a ação ao padrão, "Restaurar padrão". Associações salvas nas preferências.
- **No jogo:** o jogador local da demonstração usa a entrada (como `Room.handle` faz com `input`/`fire`); Delete = suicídio na sim; Page Down segurado = `setDropKey`; as telas de F1–F5/F8, troca de time, mensagens, nomes, som e captura são de outros cards (OG-044/045/065/066/067) e por ora mostram "em breve". Start do gamepad abre o menu. Fechar a aba no meio da partida pede confirmação (Ctrl+W acidental com o tiro apertado).
- **Verificação:**
  - `tools/visual-compare/keys.mjs` no Chrome: setas, teclado numérico, Shift corre (58 contra 4 unidades), Alt esquiva sem girar a arma, Ctrl atira, Alt+← **não** volta a página, Ctrl+setas sem efeito no navegador, F1–F9, Insert, Ctrl+End, Ctrl+M, Page Down, Delete mata, Esc abre o menu: **20/20 OK**;
  - remapeamento: tiro em Espaço pela tela de Controles, que atira sem rolar a página;
  - testes: `bindings.test.ts` (vetores da spec, esquemas, remapeamento, persistência, gamepad).
  - Print: `tools/parity/out/prints/og063-controles.png`.
- **Não testado com hardware:** gamepad físico (só a leitura do estado, por teste unitário) e o `keyboard.lock` do modo foco, que exige tela cheia de verdade (headless não tem).
- **Divergências (D-15):** remapeamento e gamepad padrão; teclas por posição física; captura em F9 (F11 é a tela cheia do navegador); F12 sem uso; sem mira por mouse na v1.
- Branch: `og-063-input` (empilhada sobre `og-062-renderer-entities`).
