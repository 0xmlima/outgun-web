# OG-100 — Paridade automatizada no CI

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S2 |
| Status | Backlog |
| Dependências | [OG-003](OG-003-parity-harness.md) |
| Regras de negócio | — |
| Skills | `outgun-parity-harness` |

## História
Como time, quero que toda mudança na sim seja checada contra os golden traces, para nunca regredir a paridade.

## Contexto e referências no original
- Harness do OG-003.

## Escopo
- Job de CI que roda todos os traces contra `packages/sim`.
- Relatório de divergência como artefato e comentário no PR.
- Job opcional (manual) que regrava traces a partir do container.

## Critérios de aceite
- [ ] PR que altera a física e diverge falha no CI com o frame/campo divergente.
- [ ] Tempo do job < 5 min.

## Notas técnicas
- —

## Notas de implementação
- Adiantado no OG-003: `pnpm test` (e portanto `pnpm verify`/CI) já valida a estrutura de todos os traces e o harness. Falta, quando a sim existir (OG-021+), rodar `runParity` dos cenários contra a sim e publicar o relatório de divergência.
