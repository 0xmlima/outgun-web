# OG-462 — Diagonal + Alt rápidos ainda registram a direção errada

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S50 |
| Status | Pronto |
| Dependências | — |
| Issue | [#18](https://github.com/thiagovasconcellos/outgun-web/issues/18) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador experiente, quero que diagonal + Alt apertados rápido virem a arma (ou não) como eu quis, sempre.

## Contexto
- Issue #18 (médio; às vezes). 2.49.1, desktop/Steam no Windows, master. "Clicar diagonal + Alt rápido, trava na posição anterior. Acontece bem menos vezes, mas ainda acontece." Sugestão dele: "diagonal em 1 ms".
- Continuação do OG-372 (`ChordFilter`, janela de acorde de 30 ms, opção "Tolerância de diagonal" 0–60 ms em Controles). "Bem menos" = a janela ajudou; sobra algum caso.
- A 2.49.2 passou a descartar inputs acima de 40/s (`input-guard.ts`): conferir se rajadas de acorde não caem nesse limite.

## Escopo
- Repassar os casos do `ChordFilter` com Alt + diagonal (Alt antes da segunda seta, Alt solto entre as setas, troca de diagonal sem soltar o Alt) e cobrir os que faltam em `chord.test.ts`.
- Conferir se o descarte do `input-guard` acontece em uso normal; se sim, ajustar a medida (fichas) para não perder acorde.
- Perguntar ao jogador (pela issue) qual tolerância usa.

## Critérios de aceite
- [ ] Casos novos de Alt + diagonal em `chord.test.ts` passam.
- [ ] Acorde rápido nunca é descartado pelo `input-guard` (teste).
- [ ] PO confere.

## Notas de implementação
(preenchido durante a execução)
