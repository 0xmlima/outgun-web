# OG-331 — Resultado de partida recusado pela API não se perde

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Melhoria |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S34 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-RKL-03 |
| Skills | `outgun-card-workflow` |

## História
Como operador do beta, quero que um resultado recusado fique guardado para reenviar depois de corrigir a causa, sem reconstruir do replay.

## Contexto
- No OG-329 a API recusou um resultado (422) e o game server só registrou um aviso: o corpo se perdeu e foi preciso reconstruí-lo do replay (OG-330). Erros 5xx/rede também desistem depois de 5 tentativas.

## Escopo
- Ao desistir de `POST /internal/matches` (4xx ou tentativas esgotadas), gravar o corpo em `REPLAY_DIR/failed/<serverMatchId>.json` (mesmo volume dos replays) e logar como `error`.
- `deploy/vps/resend-match.sh` aceita esse arquivo direto.

## Critérios de aceite
- [x] Teste: resposta 422 da API grava o corpo do resultado; 201 não grava nada.

## Notas de implementação
- Pasta `failed/` dentro de `REPLAY_DIR` (volume `replays` no beta): a retenção só apaga `.ogr` e o `/replays/` só serve `.ogr`, então os resultados não ficam públicos nem somem. Sem replays (`REPLAYS=0`), só o log.
- Reenvio: copiar o arquivo do contêiner e usar `deploy/vps/resend-match.sh` (OG-330).
