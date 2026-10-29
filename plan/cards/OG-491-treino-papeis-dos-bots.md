# OG-491 — Treino: papéis fixos dos bots (guardar base, atacar, perseguir, levar e escoltar a bandeira)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S55 |
| Status | Em revisão |
| Dependências | OG-490 |
| Regras de negócio | RN-TRN-03, RN-TRN-08, D-86, D-87 |
| Skills | `outgun-card-workflow` |

## História
Como jogador treinando, quero que cada bot cumpra o papel do modo, para a situação de treino se repetir de verdade.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- Hoje a IA (`packages/bots/src/brain.ts`, `ChooseDestination`) escolhe o destino sozinha pela situação das bandeiras: não existe papel fixo, e um "defensor" pode sair para atacar.

## Escopo
- **Bot de treino separado (D-87):** classe nova `TrainingRobot` em `packages/bots/src/training/`, usada só nas salas de treino. Ela **herda a inteligência** do bot atual (mira, combate, desvio, navegação e o nível 1 a 5 do OG-266), mas o **destino e o que o bot pode fazer** vêm só do papel. O `Robot` do Casual (`brain.ts`, `ChooseDestination`) não muda em nada.
- **Papéis e o que cada um pode fazer (lista fechada; o resto é proibido):**
  - **Guardar a base** — fica na sala da base do seu time, caça quem entra e volta se for empurrado para fora. Nunca vai atrás da bandeira do outro time, nunca pega bandeira e nunca sai da sala da base (no máximo persegue até a porta).
  - **Atacar a bandeira** — vai direto à bandeira do outro time, pega e tenta sair da sala da base com ela. Não volta para defender.
  - **Perseguir o portador** — segue o portador entre salas e atira nele. Não pega nem devolve bandeira, não vai à base de ninguém.
  - **Levar a bandeira para casa** — o portador do modo Captura: anda até a própria base pelo caminho e só atira para abrir passagem.
  - **Escoltar o portador** — fica perto do portador e atira em quem se aproxima. Não pega bandeira.
- **Papel por modo (fechado):** Ataque = só **guardar** do outro lado; Defesa = **atacar** (bots inimigos) e **guardar** (aliados); Fuga = só **perseguir**; Captura = **levar** + **escoltar**. Bot de treino sempre tem papel; não existe bot de treino "livre".
- **Trava no servidor:** na sala de treino, o servidor só deixa um bot pegar bandeira se o papel dele permitir (atacar ou levar). Mesmo que a IA erre, um defensor não sai com a bandeira.
- Na Defesa, os atacantes saem juntos (RN-TRN-04).

## Critérios de aceite
- [x] Testes por papel com mapas de fixture e com os mapas de treino (RN-TRN-06): o guardião não sai da sala da base e nunca vai à outra bandeira; o perseguidor segue o portador entre salas; o portador vai à base; ninguém pega bandeira fora do papel.
- [x] Teste da trava: bot com papel guardar/perseguir/escoltar encostando numa bandeira não a pega.
- [x] `brain.ts` e os testes dos bots do Casual sem nenhuma mudança (garantia completa no OG-513).

## Notas técnicas
- Reaproveitar mira, combate e navegação do `RobotCore`/`Robot` por composição ou herança, trocando só o `chooseDestination` e acrescentando a trava; se precisar expor algo do `Robot`, só exportar, sem mudar o comportamento.
- `apps/game-server/src/bot-client.ts:221` escolhe a classe pelo tipo da sala: `TrainingRobot` só com `room.kind === 'training'`; bots do Casual, do Ranked e os substitutos continuam no `Robot`.

## Notas de implementação
- `packages/bots/src/training/training-robot.ts`: `TrainingRobot extends Robot`, troca só `getFlag`, `chooseDestination` e `followFlag` (guarda fica no posto em vez de passear). `BotClient` recebe o papel; sem papel continua `Robot`.
- Trava: gancho opcional `mayTakeFlag` na sim (sem ele, nada muda; a referência do OG-513 confirma), usado só pela sala de treino com `roleMayTakeFlag`.
- Achado: o bot só conhece posições que vê; na sala de treino `always_send_flag_location` fica ligado para o perseguidor e a escolta acharem o portador.
- Testes em `training-room.test.ts` nos cinco mapas de treino (guardas nunca saem da base nem pegam bandeira; aliados idem; atacantes chegam à base; perseguidores alcançam; portador vai para casa).
