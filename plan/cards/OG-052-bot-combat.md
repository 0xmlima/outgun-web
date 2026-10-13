# OG-052 — Bots: mira, tiro e esquiva

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Em revisão |
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
- [x] Cenários de paridade (alvo parado, alvo em movimento, foguete vindo, explosão na sala) com controles idênticos ao original.
- [x] Bot nunca dispara quando `GetHitTeammateTime` indica acerto em companheiro antes do inimigo.

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
- Spec: [plan/specs/bots-ia.md](../specs/bots-ia.md). `packages/bots/src/combat.ts`: `TryAimTradTurning`, `GetDangerousRocket` (posição extrapolada com a velocidade recebida, como o original), `GetEasyEnemy`, `GetDangerousEnemy`, `GetNearestEnemy`, `TryAimFreeTurning`, `GetHitTime`, `GetHitTeammateTime`, `NeedShootFreeTurning` (com `random_shuffle` da libstdc++), `ShootAtDoorTradTurning`, `NeedShootTradTurning`, `predictDistanceFromRocket` (extrapola com a física da sim), `EscapeRocket`, `EscapeExplosion`, `Aim`, `IsMassive`.
- **D-30**: limiar de mira fixo em 19,5 (no original é um `static` calculado na primeira mira do processo; os bots começam com a arma 1). Achado com o oráculo: com o limiar de 2 ou 3 foguetes, centenas de decisões divergem em verde; com 19,5, nenhuma.
- Critério 1: os 5 cenários `bots-ai-*` (OG-051) têm, entre as 22.726 decisões, 4.245 com alvo (3.887 com o alvo se movendo), 3.448 atirando, 2.745 com foguete inimigo na sala e 151 com explosão de deathbringer na sala; o teste de paridade decisão a decisão (entra com o OG-053, que fecha o laço do bot) dá **controles e tiro idênticos ao original em todas**. Giro livre: `gunDir` difere só na 15ª casa (V8 × glibc).
- Critério 2: `combat.test.ts` — com fogo amigo e um companheiro entre o bot e o inimigo, `NeedShootTradTurning` não atira (e escolhe outra direção livre quando há); sem fogo amigo, atira; companheiro atrás do inimigo não impede. Mais testes de mira (alvo parado/em movimento) e esquiva.
