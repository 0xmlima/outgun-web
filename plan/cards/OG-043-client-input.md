# OG-043 — Entrada do cliente e validação

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S6 |
| Status | Concluído |
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
- [x] Inputs fora de ordem/duplicados não quebram a simulação.
- [x] Cliente que envia mais que o limite é desconectado com motivo `client_misbehavior`.

## Notas técnicas
- —

## Notas de implementação
- **Spec:** [`plan/specs/entrada-servidor.md`](../specs/entrada-servidor.md): `incoming_client_data` e `processMessage` do original e as regras novas.
- **`apps/game-server/src/input-guard.ts`:** `isNewerOrSame` (janela de 128 do contador de 8 bits do original) e `InputGuard` (balde de fichas por tipo de mensagem, recarregado a cada tick: `input` 30/s com rajada de 60, `fire`/`dropFlag` 20/s, `suicide`/`changeTeam`/`clientReady`/`minimapBandwidth` 2/s, demais 5/s; `gundir` acima de 12 bits e `hello` repetido são inválidos).
- **`Room`:** input atrasado ou duplicado antigo é ignorado (o primeiro vale com qualquer número); qualquer violação → `disconnecting` com `misbehavior`, fechamento com código 4003 e texto `client_misbehavior`, saída da sala, registro em `room.kicks`. Atividade (RN-IDL-01): `input` com controles, `fire` ligado, suicídio, largar bandeira e troca de time atualizam `lastActivity(pid)`; o idle kick é do OG-047.
- **`server.ts`:** depois de entrar, mensagem que nem decodifica também é `client_misbehavior` (antes fechava com 4002).
- **Testes:** `input-guard.test.ts` (ordem e volta do contador; fora de ordem e duplicados com a sim rodando depois; ritmo real do cliente por 30 s sem expulsão; rajada de 200 inputs, suicídio em excesso, `gundir` inválido e `hello` repetido expulsam; recarga do balde; atividade) e `server.test.ts` (flood e bytes inválidos pelo WebSocket de verdade fecham com `client_misbehavior`).
- **Divergência (D-17):** sem o histórico redundante dos últimos N inputs previsto no escopo. Os controles são estado absoluto e os eventos vão no canal confiável; no WebSocket não há perda, e num transporte sem garantia (WebTransport, v2) basta o input mais novo. Decisão delegada pelo PO ao time técnico (2026-10-13): fica sem histórico; um histórico só gastaria banda e abriria espaço para o cliente reescrever frames passados.
- Branch: `og-043-client-input` (empilhada sobre `og-042-snapshots-aoi`).
