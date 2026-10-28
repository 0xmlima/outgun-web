# OG-468 — Replay sem som (e o +/- do teclado numérico é zoom, não volume)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S50 |
| Status | Pronto |
| Dependências | — |
| Issue | [#24](https://github.com/thiagovasconcellos/outgun-web/issues/24) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador assistindo a um replay, quero ouvir os sons da partida e ajustar o volume.

## Contexto
- Issue #24 (Partida/HUD; Médio; Sempre). 2.49.2, Steam no Windows, coiote. O replay fica mudo; o +/- do teclado numérico não aumenta o volume.
- Causa: o `replay-host.ts` não tem áudio (o `SoundEvents`/`SoundPlayer` só existem no `host.ts:33`). No replay, `NumpadAdd`/`NumpadSubtract` (`replay-host.ts:168`) mudam o zoom, então o jogador não tinha como ouvir nada.

## Escopo
- Tocar no replay os mesmos efeitos da partida (`SoundEvents` a partir dos frames reproduzidos), respeitando o volume de efeitos e o mudo das Opções; sem som com o replay pausado e coerente com a velocidade (PageUp/PageDown).
- Deixar claro na ajuda do replay que +/- é zoom, e qual tecla/botão controla o som.

## Critérios de aceite
- [ ] O replay toca os sons da partida no volume configurado.
- [ ] Pausar silencia; mudar a velocidade não empilha sons.
- [ ] A ajuda do replay diz o que o +/- faz e como mudar o som.
- [ ] PO confere.

## Notas de implementação
(preenchido durante a execução)
