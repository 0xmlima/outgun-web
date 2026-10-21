# OG-344 — Resultado e detalhes da partida num modal ao fim do jogo

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S36 |
| Status | Pronto |
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
