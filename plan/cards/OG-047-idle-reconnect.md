# OG-047 — Idle kick, desconexão e reconexão

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S8 |
| Status | Concluído |
| Dependências | [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-IDL-01 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero voltar à partida se minha conexão cair por alguns segundos; como sala, quero remover inativos.

## Contexto e referências no original
- Idle kick (`server.cpp:1640-1660`).
- `client_disconnected` (`servnet.cpp:1525`).

## Escopo
- Aviso e expulsão por inatividade com os limites do original.
- Reconexão em até 15 s mantendo slot, time e estatísticas (novo).

## Critérios de aceite
- [x] Queda de rede de 10 s não perde frags nem time.
- [x] Idle kick só ocorre com ≥ `idlekick_playerlimit` humanos.

## Notas técnicas
- —

## Notas de implementação
- Spec: [plan/specs/inatividade-reconexao.md](../specs/inatividade-reconexao.md); decisão **D-22** (PLAN seção 12).
- **Idle kick (RN-IDL-01):** port do laço de `src/server.cpp:1632-1661` em `Room.playerTimers` (junto com a contagem da expulsão do OG-046, na mesma posição do frame: depois da simulação, antes do envio): `idlekick_time`/`idlekick_playerlimit` do preset, ociosidade = sem tiro e controles `& 31` zerados, morto e fim de partida não contam nem zeram, bots não contam como humanos, avisos 60/30/15/5 s com as mesmas condições do original e desconexão `idleKick` (código 4006).
- **Reconexão (novo):** `Room.disconnect(pid, conn)` guarda a vaga por `reconnectSeconds` (15; 0 = como o original), com o jogador parado no mundo; `Room.resume` devolve a vaga pelo token (`resumeToken`, novo a cada entrada/volta) ou pela conta, reinicia o estado da conexão (entrada, rodízio do minimapa, HUD) e reenvia o estado completo (incluindo os próprios frags). Só a conexão atual do jogador conta como queda (o fechamento atrasado de uma conexão antiga não derruba a nova); uma conexão antiga ainda aberta é fechada com `resumed`.
- **Protocolo v2:** mensagens 7 `resumeToken` (s2c) e 8 `resume` (c2s, no mesmo pacote do `hello`); MESSAGES.md regenerado.
- **Cliente:** ao cair (sem recusa nem expulsão), mostra "Conexão perdida. Reconectando..." e tenta a cada 1 s por até 14 s com ticket novo + token, reaproveitando a mesma sessão (o servidor reenvia o estado; os frames continuam na mesma linha do tempo). Retomada por outra janela encerra a antiga sem disputa.
- **Testes:** 9 em `idle.test.ts` (idle com limite de humanos; avisos e expulsão no 1200º frame vivo com 120 s; 60/30/15/5 com 180 s; mexer zera; 0 desliga; queda de 10 s mantém frags e time; conta sem token × convidado com token; vaga liberada no 150º frame; conexão antiga; `reconnectSeconds` 0), 2 no WebSocket real (`server.test.ts`). Roteiro `tools/visual-compare/reconnect.mjs`: queda simulada no navegador, mesmo pid e time na volta, servidor sempre com 2 jogadores (prints `og047-*.png`).
