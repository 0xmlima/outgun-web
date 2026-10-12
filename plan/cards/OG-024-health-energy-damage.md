# OG-024 — Vida, energia, dano e shield

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S3 |
| Status | Backlog |
| Dependências | [OG-022](OG-022-rockets.md) |
| Regras de negócio | RN-VID-01, RN-VID-02, RN-VID-03, RN-VID-04, RN-VID-05, RN-TIR-05, RN-TIR-07 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero que vida e energia regenerem e sejam gastas como no original, para equilibrar correr, atirar e sobreviver.

## Contexto e referências no original
- `regenerateHealthOrEnergy`, `degradeHealthOrEnergyForRunning` (`world.cpp:3087-3120`).
- `damagePlayer` (`world.cpp:2274-2370`).
- Megahealth e limites em `simulatePlayerPostPhysics`.

## Escopo
- Regeneração por faixas com consumo do tempo do frame.
- Penalidade de corrida.
- Dano com shield (energia/acertos), hit stun, friendly fire.
- Megabonus 5/frame.

## Critérios de aceite
- [ ] Testes unitários para cada faixa de regeneração e transições.
- [ ] Traces de dano/morte idênticos.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
