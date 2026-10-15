# OG-213 — Marcos (milestones) do jogador

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S15 |
| Status | Concluído |
| Dependências | [OG-211](OG-211-api-social.md) |
| Regras de negócio | RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ganhar marcos ao atingir feitos, para ter objetivos e mostrar minha história no jogo.

## Contexto
- Dados já existentes em `match_players` e `matches.details` (OG-085).

## Escopo
- Catálogo de marcos versionado no código (lista inicial a validar com o PO: 1ª partida, 1ª captura, 10/100/1000 partidas, 100/1000/10000 kills, 50 capturas, precisão ≥ 50% numa partida, 10 vitórias seguidas, jogou o beta...).
- Cálculo no fim de cada partida e cálculo retroativo (script) para o histórico já gravado.
- Data de conquista de cada marco; marcos no perfil e na tela de fim de partida.

## Critérios de aceite
- [x] Testes do cálculo de cada marco; script retroativo idempotente.
- [x] Marcos aparecem no perfil (OG-212).

## Notas técnicas
- Só partidas com conta; kills em bots não contam para marcos.

## Notas de implementação
- Catálogo e cálculo puros em `packages/content/src/milestones.ts` (12 marcos, ids estáveis); a API grava em `player_milestones` (migration 0015) na transação da partida e `node dist/cli.js milestones` faz o retroativo (ON CONFLICT DO NOTHING). Marcos também no relatório da partida.
- Kills em bots: o game server passa a mandar `stats.botKills`; partidas antigas não têm o campo (contam todas as kills). Precisão exige ≥ 20 tiros; "Pioneiro" = partida jogada com `BETA=1`.
- Lista inicial validada pelo PO em 2026-10-15 (pode crescer depois). A v2 não vai para o servidor do beta (v1).
