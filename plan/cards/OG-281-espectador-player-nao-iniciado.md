# OG-281 — Espectador ao vivo às vezes abre com "player não iniciado"

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Correção |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S21 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como espectador, quero que a partida ao vivo abra sempre, para não cair numa tela preta com erro.

## Contexto
- Achado no fechamento da S20 (`pnpm visual:check`): a captura `espectador` falhou em 2 de 3 rodadas com a tela preta e o texto "player não iniciado" (`apps/web/src/game/replay-host.ts:153`). O `replay-host` não mudou na S20.
- Causa provável: ao vivo, o primeiro segmento chega pelo `setReplay` enquanto o `app.init` ainda não terminou, e o `open` encontra `setup` vazio (ele só é atribuído depois do `init`).

## Escopo
- O `open` espera o carregamento (promessa criada antes do `init`, ou fila até o `setup` existir), sem perder o segmento que chegou cedo.

## Critérios de aceite
- [ ] `pnpm visual:check -- --only espectador` passa em 5 rodadas seguidas.

## Notas de implementação
- A fila de aberturas (`opening`) nasce pendente e só anda depois do `app.init` + carregamento; o replay inicial entra primeiro na fila, antes de qualquer segmento ao vivo. As 5 rodadas do `visual:check` ficam para o PO/fechamento.
