# OG-336 — Mensagem não começa com "n" e o "p" pausa em vez de digitar

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S35 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-RKL-15 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero começar uma mensagem com qualquer letra sem disparar ações do jogo.

## Contexto
- Relatos de 2026-10-21: não dava para digitar "n"; o "p" da pausa atrapalhava a digitação.
- O chat começa ao digitar uma letra, exceto se a tecla for "do jogo" (`online-hud.ts`). A checagem olhava só a tecla física: o N (associado só a Ctrl+N, mostrar nomes) e o P (pausa, sozinho) nunca começavam mensagem; o P pedia pausa.

## Escopo
- `isGameKey`: a tecla é do jogo só se casar com a associação inteira (modificadores incluídos).
- Pausa: Ctrl+P ou Pause no esquema Clássico; Pause ou Home no Navegador (sem Ctrl/Alt). Associação salva com P sozinho migra para a do esquema.

## Critérios de aceite
- [x] Testes: N e P sozinhos não são do jogo; Ctrl+N/Ctrl+P são; migração do P salvo.
- [ ] PO confere: mensagens começando com "n" e "p"; pausa com Ctrl+P.

## Notas de implementação
- O replay continua pausando com P (não tem chat).
