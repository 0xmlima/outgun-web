# Spec: inatividade, desconexão e reconexão
Card(s): OG-047 · RNs: RN-IDL-01

## Resumo
Idle kick igual ao original; a queda de conexão, que no original tirava o jogador na hora, passa a
guardar a vaga por 15 s para ele voltar com o mesmo time e as mesmas estatísticas.

## Fonte
- `src/server.cpp:1632-1661` — laço por jogador depois da simulação: contagem da expulsão por admin (`continue`), depois idle: pula fim de partida, morto e bot local; `idle = !attack && !attackOnce && controls.idle()`; se `idlekick_time != 0 && idle && humanos ≥ idlekick_playerlimit`: `++idleFrames`, `timeToKick = idlekick_time − idleFrames`; 0 → `disconnect_idlekick`; avisos (`data_idlekick_warning`) a 60 s se `idlekick_time ≥ 180 s`, 30 s se ≥ 90 s, 15 s se ≥ 30 s, 5 s se ≥ 10 s; senão `idleFrames = 0`.
- `src/commont.h:80` — `ClientControls::idle()`: `data == 0` (o servidor guarda só os bits de movimento, `& 31`).
- `src/server_settings.cpp` — `idlekick_time` (s, 10 ou mais, ou 0 = desligado; padrão 120), `idlekick_playerlimit` (1..32; padrão 4).
- `src/servnet.cpp:1525` — `client_disconnected`: remove o jogador na hora.

## Algoritmo (idle)
```
por jogador, depois da simulação, antes de enviar o frame:
  se caiu e espera volta: libera a vaga quando completar 150 frames; próximo
  se kickTimer: ...; próximo
  se fim de partida ou morto ou bot: próximo           (idleFrames não zera)
  idle = sem tiro, sem tiro pendente e (controles & 31) == 0
  se idlekick_time ≠ 0 e idle e humanos ≥ idlekick_playerlimit:
     idleFrames++ ; t = idlekick_time − idleFrames
     t == 0 → desconecta (idleKick) ; avisos em 600/300/150/50 frames conforme acima
  senão idleFrames = 0
```

## Reconexão (novo, D-22)
1. Ao entrar, o servidor manda `resumeToken` (aleatório, 128 bits); um token novo a cada volta.
2. Quando a conexão cai sem o servidor ter expulsado o jogador, a vaga fica guardada por 15 s (`reconnectSeconds`): o jogador continua no mundo, parado (controles e tiro zerados), sem mensagem para os outros; se não voltar, sai como no original (`playerLeft`).
3. O cliente que perde a conexão mostra "Conexão perdida. Reconectando..." e tenta a cada 1 s, por até 14 s: pede um ticket novo à API e manda `hello` + `resume` (token) no mesmo pacote. O servidor devolve a mesma vaga (pid, time, cor, frags, estatísticas, votos, silêncio) e reenvia o estado completo; o jogador precisa confirmar o mapa (`clientReady`) de novo.
4. Conta volta mesmo sem token (outra aba, mesmo `accountId`); convidado só com o token.
5. Se a conexão antiga ainda não tinha caído para o servidor, ela é fechada com `resumed`; o cliente antigo não tenta retomar (evita duas janelas disputando a vaga).
6. Expulsão (admin ou inatividade), recusa e bots não guardam vaga.
7. Protocolo: mensagens 7 (`resumeToken`, s2c) e 8 (`resume`, c2s); `PROTOCOL_VERSION` 2.

## Casos de borda
1. Idle com menos humanos que o limite: nunca expulsa (os bots não contam).
2. Morto não conta nem zera a contagem (como o original).
3. Queda durante a contagem de expulsão por admin: sai na hora.
4. A vaga guardada conta como jogador (ocupa lugar no time e na sala) e não é expulsa por inatividade.
5. `reconnectSeconds = 0` reproduz o original (sai na hora).

## Vetores de teste
`apps/game-server/src/idle.test.ts` (idle com limite, avisos 30/15/5 em 120 s e 60/30/15/5 em 180 s, expulsão no 1200º frame vivo, queda de 10 s com frags e time, conta sem token, 15 s, conexão antiga), `apps/game-server/src/server.test.ts` (volta pelo WebSocket com token), `tools/visual-compare/reconnect.mjs` (navegador).
