# OG-263 — Marca "concluída com bots" em partidas Ranked

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S20 |
| Status | Concluído |
| Dependências | [OG-262](OG-262-voto-bot-substituto.md) |
| Regras de negócio | RN-RKL-20 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero saber quais partidas Ranked terminaram com bots, para ler os números delas com esse contexto.

## Escopo
- Gravar na partida quantos bots substitutos entraram e quando; também quantos jogadores ficaram a menos.
- Selo "Concluída com bots" (e "Com um a menos") no relatório, nas partidas recentes do perfil e na página da série.
- A partida **conta para o ranking** normalmente, com a marca (D-46); o bot não ganha pontos (sem conta) e kills em bots não contam para marcos (OG-213).

## Critérios de aceite
- [x] Partida com bot substituto mostra o selo nas três telas; partida normal não mostra.
- [x] Testes da gravação e do filtro.

## Notas de implementação
- Game server: `substitutions` no relatório (`{ kind: 'bot' | 'short', team, atSeconds }`), zeradas a cada jogo. API: migration 0026 (`matches.substitute_bots`, `short_handed`, `substitutions` jsonb); `validateMatch` agora aceita bot no Ranked só se declarado como substituto (até 2, sem conta nem deltas) — revisa a recusa da D-11.
- Resumo (`MatchSummary` e jogos da série) ganhou `withBots`/`shortHanded`; selo `SubstitutionBadges` (`stats.tsx`) no relatório, nas partidas do perfil e na página da série.
- Kills em bot substituto já ficam em `stats.botKills` (o cliente tem `bot: true`), que os marcos ignoram. Não há filtro novo na interface: o "filtro" do critério ficou como a marca só nas partidas com substituição (teste do resumo normal sem selo).
