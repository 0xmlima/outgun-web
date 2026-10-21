# OG-344 — Resultado e detalhes da partida num modal ao fim do jogo

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S36 |
| Status | Em revisão |
| Dependências | OG-343 |
| Regras de negócio | RN-RKL-02, RN-UI-05, RN-UI-07 (D-63) |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o resultado e os números da partida quando ela acaba, e sair quando eu quiser.

## Contexto
- Pedido do PO (2026-10-21). Hoje aparece o placar sobre o mapa escondido e o redirecionamento é automático (série → lobby; md1/série encerrada → menu; Casual → próximo mapa depois de `game_end_delay` 5 s).

## Escopo
- Modal (design system v2) com: resultado do meu time (vitória/derrota/empate), placar, motivo (capturas, tempo, prorrogação), tabela por jogador (frags, capturas, kills/mortes, devoluções) e, no Ranked, variação de score/neg e placar da série.
- Botão "Continuar" com contagem de 10 s; ao fechar (botão, Esc ou tempo), segue o destino atual: série não encerrada → lobby da sala; Ranked md1 ou série encerrada → menu; Casual → próximo mapa.
- Casual: intervalo entre mapas vai para 10 s (`game_end_delay 10` no Clássico e presets Casual), para o modal cobrir o intervalo; fechar antes mostra a espera do próximo mapa.
- Espectador e replay: mantêm o placar atual (sem modal).

## Critérios de aceite
- [ ] Os três destinos testados (série, md1, Casual).
- [ ] RN-UI-05: sobreposição temporária; `pnpm visual:check` sem diferença fora do modal; partida online de verdade e capturas ao PO.

## Notas de implementação
- Modal em DOM (`Dialog` do OG-342) por cima do canvas: o placar antigo segue desenhado embaixo, então o HUD não muda; o `visual:check` fecha o modal com Esc antes de capturar o fim de partida. O lobby da série (e o menu, no fim da série/md1) espera o modal fechar.
- `game_end_delay` vai a 10 s no Clássico e em tudo que deriva dele (Casual e Ranked). No fim de partida a tela F3/F4 automática não abre mais (o modal mostra os números).
- **Pendente:** a variação de score/neg do Ranked não chega ao cliente no fim do jogo (vai só no resultado para a API); fica para um card se o PO quiser. Destinos testados só pelo resumo (`match-end.test.ts`); a navegação o PO confere.
