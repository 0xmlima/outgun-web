# OG-052 — Bots: mira, tiro e esquiva

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Pronto |
| Dependências | [OG-042](OG-042-snapshots-aoi.md) |
| Regras de negócio | RN-BOT-02 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero bots que mirem, atirem e desviem de foguetes como no original, para um combate crível.

## Contexto e referências no original
- `src/robot.cpp:84-654` (`ScanDir`, `GetDir`, `GetDangerousRocket`, `GetEasyEnemy`, `GetDangerousEnemy`, `GetNearestEnemy`, `GetHitTime`, `GetHitTeammateTime`, `predictDistanceFromRocket`, `EscapeRocket`, `EscapeExplosion`, `Aim`, explosões do deathbringer).

## Escopo
- Escolha de alvo, mira, decisão de tiro (sem acertar companheiro), esquiva de foguetes e explosões.
- Usa só o que o snapshot entrega (RN-BOT-02).

## Critérios de aceite
- [ ] Cenários de paridade (alvo parado, alvo em movimento, foguete vindo, explosão na sala) com controles idênticos ao original.
- [ ] Bot nunca dispara quando `GetHitTeammateTime` indica acerto em companheiro antes do inimigo.

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
(preenchido durante a execução)
