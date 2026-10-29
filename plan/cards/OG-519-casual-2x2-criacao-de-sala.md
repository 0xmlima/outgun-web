# OG-519 — 2x2 na criação de sala Casual

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S56 |
| Status | Em revisão |
| Dependências | OG-517 |
| Regras de negócio | D-88 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero criar uma sala Casual 2x2 em um clique, já com os mapas pequenos.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P1: nada muda na sala oficial: ela continua sempre aberta e rotativa, e quem está nela altera o setup e vota no mapa como hoje. O 2x2 só passa a ser opção na criação de salas.
- A criação Casual já aceita vagas (`maxPlayers`, `apps/web/src/screens/lobby.tsx:420`).

## Escopo
- Atalho "2x2" no formulário de criação Casual: 4 vagas e a rotação 2x2 (OG-517) como mapas da sala.
- Sala oficial e "Jogar agora" sem mudança.

## Critérios de aceite
- [x] Sala Casual criada pelo atalho 2x2 abre com 4 vagas e só os mapas da rotação 2x2.

## Notas técnicas
- —

## Notas de implementação
- Toggle "2x2" no formulário Casual: 4 vagas e os mapas da rotação 2x2 (vindos de `GET /rotation` → `duo`). Sala de 4 vagas aceita mapas da rotação 2x2 além da Casual (API, spawn e troca de rotação pelo painel, `casualChoices`).
