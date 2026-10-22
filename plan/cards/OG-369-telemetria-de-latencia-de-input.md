# OG-369 — Medir a latência do input, da tecla ao servidor

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S39 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero números de quanto tempo uma tecla leva até valer no servidor e na tela, para comparar antes e depois da S39 e responder à comunidade com dados.

## Contexto
- Queixa da comunidade (2026-10-22): atraso no registro das teclas, diagonal com Alt "falhando". Hoje não medimos nada entre a tecla e o servidor: a telemetria do cliente (`apps/web/src/game/net/telemetry.ts`) só tem ping, lag, FPS e correções.
- Primeiro card da sprint: a linha de base é gravada **antes** de OG-370 a OG-372 mexerem no envio.

## Escopo
- Cliente: para cada mudança de controles, tempo da tecla (`KeyboardEvent.timeStamp`) até o envio da mensagem e até o primeiro quadro desenhado com ela (predição); p50/p95 na amostra de telemetria e no overlay de rede (só com o overlay ligado).
- Servidor: tempo entre a chegada de um `input` e o tick que o aplica (espera no tick) e quantos inputs por tick foram descartados por já haver um mais novo; p50/p95 nas métricas da sala.
- Script reaproveitável (`tools/dev/` ou `tools/visual-compare/`) que roda uma partida local com bot, injeta sequências de teclas (diagonal, Alt + diagonal, toque curto) e grava um JSON com os números; o fechamento compara S38 × S39.

## Critérios de aceite
- [ ] Overlay de rede mostra tecla→envio e tecla→tela (p50/p95).
- [ ] Métricas do servidor expõem a espera até o tick e os inputs sobrescritos.
- [ ] Linha de base da v2.38.0 gravada pelo script em `plan/specs/` (ou anexada ao card).

## Notas técnicas
- `performance.now()` e `ev.timeStamp` estão no mesmo relógio no Chromium/Electron.
- Nada disso vai para o banco: só as métricas já existentes (observability).

## Notas de implementação
(preenchido durante a execução)
