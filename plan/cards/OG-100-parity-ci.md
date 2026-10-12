# OG-100 — Paridade automatizada no CI

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S2 |
| Status | Em revisão |
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
- [x] PR que altera a física e diverge falha no CI com o frame/campo divergente.
- [x] Tempo do job < 5 min. _(relatório em < 1 s; a regravação manual leva ~3 min de build + ~1 min de cenários)_

## Notas técnicas
- —

## Notas de implementação
- **Tabela de cobertura** (`tools/parity/src/coverage.ts`): para cada trace, o card responsável, os campos comparados e os modos (`resync`/`free`). Cada card do E2 amplia a tabela. Um trace gravado sem entrada na tabela também falha.
- **Relatório:** `pnpm parity [--report arquivo.md]` (`tools/parity/src/report.ts`, `cli.ts`) mostra ✅ idêntico, ❌ divergência (com frame e campo), ⏳ pendente (com o card) e 🔗 conferido em outro pacote. Sai com erro se algo divergir.
- **CI** (`.github/workflows/ci.yml`): o relatório roda sempre, vai para o resumo da execução (`GITHUB_STEP_SUMMARY`) e é publicado como artefato. Como o repositório não tem remoto, comentário em PR ficou de fora; o resumo da execução cumpre o papel.
- **Regravação manual** (`.github/workflows/parity-traces.yml`, `workflow_dispatch`): reconstrói o oráculo e regrava todos os cenários como artefato.
- `pnpm test` roda a mesma tabela (`coverage.test.ts`), então `pnpm verify` também barra divergências.
- Situação atual: 8 traces idênticos, 4 conferidos em `@outgun/settings` e 5 pendentes (OG-022, 024, 027, 029).
- Branch: `og-100-parity-ci`.
