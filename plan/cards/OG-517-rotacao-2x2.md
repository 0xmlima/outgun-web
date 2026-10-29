# OG-517 — Rotação de mapas 2x2 com os cinco mapas pequenos

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S56 |
| Status | Concluído |
| Dependências | OG-516 |
| Regras de negócio | RN-RKL-04, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como admin, quero uma rotação própria do 2x2, para o formato usar só mapas pequenos.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P3: mapas iniciais = 2 versus 2 (Duel), 3x3 (Duel), Cebs Park, Pari2 e The Cover 4 (os mesmos do treino, `TRAINING_MAPS`).

## Escopo
- Chave `ranked:2x2` em `ROTATION_KEYS` e no painel admin.
- Migração nova semeia a rotação com os cinco mapas.
- A mesma lista serve de rotação sugerida para salas Casual 2x2 (OG-519).

## Critérios de aceite
- [x] Painel mostra e edita a rotação 2x2; sala Ranked 2x2 só vota entre os mapas dela (teste).

## Notas técnicas
- —

## Notas de implementação
- Migração 0048: chave `ranked:2x2` no check de `map_rotations` e linha semeada com os cinco mapas; o painel e o heartbeat já iteram `ROTATION_KEYS`.
