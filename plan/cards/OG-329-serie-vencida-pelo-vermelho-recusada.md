# OG-329 — Série Ranked vencida pelo vermelho é recusada pela API

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S34 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-RKL-02, RN-RKL-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do Ranked, quero que o último jogo de uma série vencida pelo meu time conte no ranking, seja qual for o lado.

## Contexto
- Achado do beta em 2026-10-21: na série md3 `r-kvgwotx9` (3x3), o vermelho venceu os dois mapas. O mapa 1 entrou; o mapa 2 voltou `422 invalid series state` (pedido `gs-vps-000cpf`, 01:52 UTC) e se perdeu: partida, pontos do ranking e fechamento da série.
- Causa: no esquema de `POST /internal/matches`, `series.winner` era `Union([Null, Literal(0), Literal(1)])`. O Fastify valida com coerção de tipos, e o ramo `null` convertia o `0` em `null`; com `finished: true` e sem vencedor, `validateMatch` recusava. Trocar a ordem não resolve: o `Literal(0)` também declara `type: number` e passa a converter `null` em `0`.
- Toda série encerrada com vitória do vermelho era recusada; vitória do azul e jogos no meio da série passavam. O teste de `validateMatch` chamava a função direto, sem passar pela validação HTTP.

## Escopo
- `winner` com um tipo só, `type: [integer, null]` (0..1), que o Ajv não converte.
- Teste de rota: md3 2-0 para o vermelho fecha a série com `winner: 0`.
- `openapi.json` regerado.

## Critérios de aceite
- [x] Série vencida pelo vermelho é aceita e grava `winner = 0`; a md3 2-1 do azul e os jogos no meio da série continuam aceitos.
- [ ] PO confere no beta, depois do deploy, uma série vencida pelo vermelho.

## Notas de implementação
- Varredura nos outros esquemas de entrada: nenhum outro mistura `null` com número/booleano (`team` é `0 | 1` sem `null`; respostas não passam por coerção).
- Não publicado: o PO pediu para esperar as partidas Ranked da comunidade terminarem (2026-10-21).
