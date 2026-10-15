# OG-279 — Conferir série com vencedor (md3 2-1) de ponta a ponta

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Correção |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S21 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-RKL-02, RN-RKL-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de uma md3, quero ver o vencedor certo da série no jogo, no fim da série e nos relatórios, para confiar no resultado.

## Contexto
- Achado da S18 (OG-257): a série conferida terminou empatada (0 × 0, jogos sem captura). Vencedor e fim antecipado (2-0 encerra a md3) usam o mesmo `winner`/`seriesOver`, mas não foram vistos na tela.

## Escopo
- Jogar uma md3 com capturas (2-1) e uma 2-0 (série acaba sem o terceiro jogo); corrigir o que aparecer.

## Critérios de aceite
- [ ] (PO) 2-1: faixa da série, tela de fim, relatórios e página da série mostram o vencedor certo.
- [ ] (PO) 2-0: o terceiro jogo não acontece e todos voltam ao menu.

## Notas de implementação
- Revisão de código, sem defeito achado: `seriesOver`/`seriesWinner` (testes de 2-0, 2-1, md5 e empates em `ranked.test.ts`), `Room.recordSeriesGame` → relatório → API (`internal.ts` confere o estado da série) → `MatchReport`. Sem mudança de código; falta o PO jogar a 2-1 e a 2-0.
