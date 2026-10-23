# OG-404 — Bots falam no chat conforme o que acontece na partida

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S42 |
| Status | Em revisão |
| Dependências | OG-403, OG-362 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador numa sala com bots, quero que eles comentem a partida no chat como gente de verdade, para a sala parecer viva.

## Contexto
- Pedido do PO em 2026-10-23 (S42): mensagens padronizadas por tipo de acontecimento ("o time entregou a bandeira?"), aleatórias, com chance de sair e sorteio de qual bot fala.
- O game server já gera os eventos da partida (OG-362: abates, pega/larga/devolve/captura de bandeira) e tem o chat da sala (`room.ts`, filtro e `TalkMeter`).

## Escopo
- Acontecimentos (primeira lista; o PO pode ajustar): início da partida, time capturou, time sofreu captura (a bandeira foi entregue), bandeira devolvida, abate seguido (sequência), morte para o mesmo jogador várias vezes, placar virado, vitória, derrota, jogador humano entrou ou saiu.
- Para cada acontecimento: lista de mensagens, **chance** de alguém falar (%) e **quem** fala (o bot envolvido, um do time, um do time adversário ou qualquer um), sorteados no servidor.
- Naturalidade: atraso de 1 a 4 s ("digitando"), espera mínima por bot e limite de mensagens por minuto na sala; nunca responde a si mesmo em sequência. Mensagens padrão em português, com variações de escrita (minúsculas, "kkk", "gg").
- Aba **Bots** (OG-403): ligar ou desligar o chat dos bots e editar as mensagens, a chance e quem fala por acontecimento. Mensagens passam pelo filtro do chat.
- Só no Casual; nada no Ranked.

## Critérios de aceite
- [x] Numa partida com bots, as mensagens saem só nos acontecimentos certos, no tom e no ritmo configurados (teste com Rng fixo).
- [x] Chance 0% cala o acontecimento; chat dos bots desligado cala todos.
- [x] Limite por minuto respeitado mesmo com muitos acontecimentos seguidos (teste).
- [x] Moderador edita mensagens e chance, e a próxima partida já usa.

## Notas de implementação
- Catálogo e padrão em `packages/settings/src/bot-chat.ts` (11 acontecimentos, `{name}` = o outro jogador); `bot_settings.chat` (migração 0037, `{}` = padrão), `PUT /admin/bots/chat` (moderador, auditado `bot_chat`) e `config.botChat` no heartbeat.
- `apps/game-server/src/bot-chat.ts`: `BotChatter` (sorteio de chance, quem fala e mensagem; atraso 1–4 s; 20 s por bot; nunca o mesmo bot seguido; teto por minuto) e `BotChatTally` (sequência de 5/10..., 3 mortes para o mesmo, virada). A sala só cria no Casual; a fala passa pelo `chat()` normal (filtro e `TalkMeter`).
- Sequência conta abates sem morrer dentro do mapa; "jogador entrou/saiu" só para humanos.
