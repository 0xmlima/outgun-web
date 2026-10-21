# OG-348 — Voto do substituto com Ctrl+1 e Ctrl+2, liberando 1 e 2 para o chat

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S36 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | RN-RKL-18, RN-UI-05 (D-64) |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero usar 1 e 2 para mandar códigos de estratégia no chat sem votar sem querer.

## Contexto
- Pedido do PO (2026-10-21): a comunidade usa 1 e 2 para combinar estratégias. Hoje `voteBot`/`voteShort` são `Digit1`/`Digit2` (`apps/web/src/game/input/bindings.ts`), voto da RN-RKL-18.
- No navegador comum, Ctrl+1/Ctrl+2 trocam de aba e não chegam ao jogo.

## Escopo
- Esquema Clássico (app do computador e modo foco): Ctrl+1 = bot, Ctrl+2 = um a menos.
- Esquema Navegador: sem tecla; o aviso do voto ganha botões clicáveis (valem nos dois esquemas).
- 1 e 2 sozinhos deixam de ser do jogo e começam mensagem; associação salva com 1/2 migra.
- Aviso do voto mostra as teclas do esquema.

## Critérios de aceite
- [ ] Testes: 1/2 não são do jogo; Ctrl+1/Ctrl+2 votam no Clássico; migração; clique no aviso vota.
- [ ] RN-UI-05: `pnpm visual:check`; PO confere.

## Notas de implementação
