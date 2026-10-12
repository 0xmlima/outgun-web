# OG-043 — Entrada do cliente e validação

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S6 |
| Status | Pronto |
| Dependências | [OG-041](OG-041-binary-protocol.md) |
| Regras de negócio | RN-IDL-01 |
| Skills | `outgun-re-spec` |

## História
Como servidor, quero receber apenas controles do cliente e validá-los, para impedir trapaças.

## Contexto e referências no original
- `ClientControls` (`commont.h`).
- `processMessage` (`servnet.cpp:1608-1818`): fire on/off, suicide, drop flag, change team, map exit, votes.

## Escopo
- Mensagem de input por frame com número de sequência e histórico redundante dos últimos N inputs (tolerância a perda).
- Rate limit por tipo de mensagem.
- Registro de atividade para idle kick.

## Critérios de aceite
- [ ] Inputs fora de ordem/duplicados não quebram a simulação.
- [ ] Cliente que envia mais que o limite é desconectado com motivo `client_misbehavior`.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
