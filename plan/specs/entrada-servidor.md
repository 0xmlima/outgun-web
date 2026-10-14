# Spec: entrada do cliente no servidor e validação
Card(s): OG-043 · RNs: RN-IDL-01

## Resumo
Como o servidor original aceita os controles e mensagens do cliente (ordem dos frames, valores, mensagens inválidas) e como a versão web acrescenta limite de taxa e registro de atividade.

## Fonte
- `src/servnet.cpp:1818-1907` — `incoming_client_data`: o frame do cliente só é aplicado se `(clFrame − último) mod 256 < 128` (mais novo ou o mesmo); controles com `clearModifiersIfIdle`; direção da arma de 11 bits com o bit 0x800 de aceleração relativa à arma; direção só muda vivo, sem strafe (ou com giro livre); `attackGunDir` acompanha a direção se o tiro já vinha apertado; qualquer erro de leitura → `disconnect_client_misbehavior`.
- `src/servnet.cpp:1608-1816` — `processMessage`: `fire_on/off`, `suicide` (não sob efeito de deathbringer), `change_team_on/off`, `client_ready`, `map_exit_on/off`, votos, chat (caracteres não imprimíveis ou mensagem longa → expulsão), pedido de arquivo; código desconhecido fora da faixa reservada → expulsão.
- `src/server.cpp` (idle kick, OG-047): tempo sem input.

## Regras da versão web
1. **Ordem:** `input` só é aplicado se `(clientFrame − último) mod 256 < 128`; mais velhos são ignorados (fora de ordem), o repetido reaplica os mesmos controles (inofensivo).
2. **Valores:** `controls & 0x3F` (como `fromNetwork`); `gundir` acima de 0xFFF (12 bits) é mensagem inválida; `minimapBandwidth` limitado a 32.
3. **Mensagens só do servidor ou `hello` repetido:** inválidas.
4. **Limite de taxa por tipo** (balde de fichas recarregado a cada tick de 0,1 s; ao esvaziar, expulsão):

| Mensagem | Por segundo | Rajada |
|---|---:|---:|
| `input` | 30 | 60 |
| `fire`, `dropFlag` | 20 | 40 |
| `suicide`, `changeTeam`, `minimapBandwidth`, `clientReady` | 2 | 6 |
| demais (votos, chat, nome...) | 5 | 15 |

O cliente do jogo manda um `input` por frame (10/s) e eventos só na mudança de estado; os limites deixam folga de 3x para atrasos de rede que juntam pacotes.
5. **Expulsão:** mensagem `disconnecting` com motivo `misbehavior` e fechamento do WebSocket com o texto `client_misbehavior` (código 4003); o jogador sai da sala como numa desconexão.
6. **Atividade (RN-IDL-01):** cada `input` com controles diferentes de zero, `fire` ligado ou outra ação do jogador atualiza o último frame de atividade; o idle kick em si é do OG-047.

## Divergências intencionais
1. Limite de taxa por tipo de mensagem (o original não tinha; dependia do UDP e do formato fixo).
2. **Sem histórico redundante de inputs:** o card previa mandar os últimos N inputs para tolerar perda. Os controles são estado absoluto (cada input substitui o anterior) e os eventos (tiro, largar bandeira, suicídio) vão no canal confiável; no WebSocket (TCP) não há perda nem reordenação, e num transporte sem garantia (WebTransport, v2) o input mais novo basta. A regra de ordem do item 1 cobre duplicados e atrasados.
Registrado em PLAN seção 12 (D-17).

## Casos de borda
1. Contador do cliente dá a volta (255 → 0): aceito (diferença 1).
2. Input atrasado 128 frames ou mais: tratado como antigo e ignorado.
3. Jogador morto: controles guardados, direção da arma não muda.
4. Rajada legítima (aba volta do segundo plano e manda muitos pacotes juntos): absorvida pela rajada do balde.

## Vetores de teste
- Sequência 10, 12, 11 → aplica 10 e 12; ignora 11.
- 250 → 3 → aplica (volta do contador).
- 200 inputs no mesmo tick → expulsão com `misbehavior`.
- `gundir` 0x1000 → expulsão.
