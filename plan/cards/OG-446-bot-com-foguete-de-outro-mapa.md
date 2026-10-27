# OG-446 — Bot quebra com tiro do mapa anterior depois da troca de mapa

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S47 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que os bots continuem jogando depois da troca de mapa, para a partida não ficar com bots parados.

## Contexto
- Achado no Sentry (OUTGUN-SERVER-1, release 2.46.3, sala main, 30 eventos em 2 s em 2026-10-26 22:01): `RangeError: sala fora do mapa: (1, 2)` em `BotClient.step` → `ClientSession.advanceWorld` → `rocketFrameAdvance`.
- O bot carrega o mapa novo na hora (`setMap` síncrono no `onMapChange`); um `rocketFire` do mapa anterior que chega depois cria um foguete numa sala que não existe no mapa novo, e todo frame seguinte lança erro.

## Escopo
- `ClientSession` ignora tiro numa sala fora do mapa atual (vale para o bot e para o cliente web).

## Critérios de aceite
- [x] Tiro numa sala fora do mapa é ignorado e o frame seguinte não lança erro (teste em `session.test.ts`, que falha sem a correção).
- [ ] Sem novos eventos de OUTGUN-SERVER-1 no Sentry depois do deploy.

## Notas de implementação
- Guarda em `onRocket` (`packages/netcode/src/session.ts`); a simulação do servidor não muda.
