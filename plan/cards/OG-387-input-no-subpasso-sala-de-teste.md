# OG-387 — Input no subpasso atrás de opção, com sala de teste no beta

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-375 |
| Regras de negócio | D-74 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero sentir numa sala de teste o servidor aplicando minhas teclas no instante em que chegam, para a comunidade opinar antes de virar padrão.

## Contexto
- Recomendação do spike OG-375: a 10 Hz, partir o frame no instante em que a mudança de controles chegou (passo calibrado: drag `1 - d·h`, atrito e aceleração `× h`). Com as teclas paradas a física é idêntica à de hoje; some a espera de 0 a 100 ms do servidor.

## Escopo
- `packages/sim`: `applyPlayerAcceleration` com fração (padrão 1 = idêntico ao de hoje); o tick recebe, por jogador, os instantes das mudanças de controle do frame.
- Game server: opção da sala (desligada por padrão) que guarda o instante de chegada de cada input e aplica no subpasso; uma sala de teste Casual fixa no beta com a opção ligada.
- Testes da sim: com a opção desligada, as trajetórias e os replays atuais não mudam.

## Critérios de aceite
- [ ] Sala de teste no beta com a opção; salas normais e ranqueadas sem mudança.
- [ ] Teste: sem mudança de tecla no frame, a posição é a mesma do 10 Hz atual.

## Notas de implementação
(preenchido durante a execução)
