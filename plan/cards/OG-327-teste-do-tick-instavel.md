# OG-327 — Teste do tick com 32 conexões falha à toa

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como time, quero um CI que só fique vermelho quando algo quebrou de verdade.

## Contexto
- `apps/game-server/src/server.test.ts:221` ("32 conexões: tick estável em 100 ms ± 2 ms") mede o p95 do atraso do tick em tempo real: 2 ms na máquina de desenvolvimento, 5 ms com `CI`.
- Em 2026-10-20 falhou várias vezes sem mudança no servidor: localmente com o `pnpm verify` rodando os pacotes em paralelo (2,15 ms) e no CI do merge da S31 (6,7 ms). Passa quando roda sozinho. Uma falha aborta os outros testes do turbo, então esconde falhas de verdade (aconteceu na S31).

## Escopo
- Tirar a medição de desempenho da suíte comum: separar num script/teste de carga próprio (como as medições de FPS e p95 do fechamento de sprint), ou rodá-la isolada e com repetição, sem dividir CPU com os outros pacotes.
- Manter na suíte comum só o que é determinístico (tick acontece, ordem das mensagens, 32 conexões atendidas).
- `pnpm verify` e CI usando `--continue` no turbo, para uma falha não esconder as outras.

## Critérios de aceite
- [ ] `pnpm verify` e o CI passam 10 vezes seguidas sem falha de tempo.
- [ ] A meta de p95 continua medida e registrada num comando próprio.

## Notas de implementação
