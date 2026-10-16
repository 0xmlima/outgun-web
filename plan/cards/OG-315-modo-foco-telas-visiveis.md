# OG-315 — Modo foco mostra as telas do F1–F5, o menu e os avisos

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S29 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador no modo foco, quero que F4, F1, F2, F3, F5, o menu do Esc e os avisos apareçam, para não precisar sair da tela cheia.

## Contexto
Relato do PO em 2026-10-17: no modo foco as teclas funcionam, mas atalhos como F4 "não funcionam". Causa: o modo foco punha em tela cheia só o contêiner do canvas (`.game-host`); as telas de informação, o menu, os avisos e o botão de relatório ficam na camada irmã `.game-overlay`, e o navegador esconde o que está fora do elemento em tela cheia. As teclas chegavam ao jogo; o resultado é que ficava invisível.

## Escopo
- Tela cheia do contêiner do jogo inteiro (`.game`), com o canvas e as camadas por cima.
- Sem trava do ponteiro: o cursor some sobre a partida pelo CSS e volta nas telas e no menu (dá para clicar).

## Critérios de aceite
- [x] Em modo foco, F4 abre a tela de estatísticas visível por cima da partida (teste no navegador).
- [x] Cursor escondido sobre o jogo, visível nas telas.

## Notas técnicas
## Notas de implementação
- `GameOptions.focusTarget` (o `GameScreen` passa o `.game`); `toggleFocusMode` sem `requestPointerLock`; CSS `.game:fullscreen .game-host { cursor: none }`.
- Conferido numa partida com bots: `document.fullscreenElement` é o `.game`, a tela do F4 fica dentro dele e aparece na captura; o aviso do modo foco, antes invisível, também aparece.
- Alt+1 (mensagens rápidas) não era bug: a opção vem desligada (Opções › Jogo › Mensagens rápidas) e, ligada, funciona no modo foco (a mensagem vai para a linha de chat, desenhada no canvas).
- No ar desde 2026-10-17 (conferido em produção: tela cheia = `.game`, F4 visível). Verificado também a pedido do PO: a sala Ranked monta a partida pelo mesmo `GameScreen` com as mesmas preferências; o HUD por baixo do lobby é o do estilo escolhido (homologação local, Moderno). O estilo só difere se o convidado tiver um estilo e a conta outro: no login valem as preferências da conta.
