# OG-403 — Bots no painel de moderação: cadastro de nomes e de prefixos

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S42 |
| Status | Concluído |
| Dependências | OG-377 |
| Regras de negócio | RN-NOM-01 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero cadastrar os nomes e os prefixos dos bots, para que as salas pareçam cheias de jogadores de verdade.

## Contexto
- Pedido do PO em 2026-10-23 (S42): "buscar uma simulação de jogo real".
- Hoje o nome sai de `createBotName` (`apps/game-server/src/bots.ts`: prefixo fixo `BOT `, sílabas de `names.cpp`). A IA reconhece outro bot pelo nome (`player.name.substring(0, 4) === 'BOT '` em `packages/bots/src/situation.ts`), então trocar o prefixo exige marcar o bot por uma flag, não pelo nome.

## Escopo
- Aba **Bots** na moderação (tela cheia, no padrão da S40), com dois cadastros (pedido do PO em 2026-10-23):
  - **Prefixos:** lista de prefixos possíveis (ex.: `BOT-`, `[BR]`, `xX`), cada um com adicionar, editar, remover e ligar/desligar; opção "sem prefixo" como mais uma entrada da lista. Cada bot que entra sorteia um prefixo ativo.
  - **Nomes possíveis:** lista de nomes com adicionar, editar, remover, colar vários de uma vez (um por linha) e busca; cada bot sorteia um nome ativo que não esteja em uso na sala.
  - Nomes e prefixos passam pelo `nameBlocked` (OG-276) e o nome final (prefixo + nome) respeita o limite de tamanho do nome; listas vazias → comportamento atual (`BOT ` + nome gerado).
- Gravado na API (configuração única) e entregue aos game servers como as rotações (OG-383); vale nos bots que entrarem depois.
- Game server: prefixo e nome sorteados das listas, sem repetir nome na sala e sem colidir com jogador presente; nomes esgotados → gerador atual. A IA identifica bots por flag, não pelo nome.

## Critérios de aceite
- [x] Moderador cadastra prefixos e nomes, e o próximo bot que entra usa um prefixo e um nome das listas.
- [x] Prefixo ou nome desligado não é sorteado; "sem prefixo" ativo pode sair no sorteio.
- [x] Nome proibido ou longo demais é recusado com mensagem.
- [x] Prefixo trocado (ou vazio) não muda o comportamento da IA (teste).
- [x] Ranked sem mudança (lá não há bots).

## Notas de implementação
- Tabela `bot_settings` (migração 0036, uma linha) com `{ text, active }`; começa com o prefixo `BOT-` ativo e sem nomes (gerador). `GET/PUT /admin/bots` (moderador), auditado como `bot_names`; o heartbeat leva só os ativos em `config.bots` e muda a versão da configuração.
- Game server: `setPanelBotNames` no painel; `createBotName` sorteia prefixo (um só não gasta sorteio: o gerador segue a sequência do original) e nome que caiba em 15 caracteres; sem nome livre, o gerador com o prefixo sorteado.
- IA: bot marcado por `playerJoined.bot` (`ClientSession.bots`, `BotPlayer.bot`) no lugar do prefixo `BOT ` (`situation.ts`, `.Roger` do `bot-client.ts`); o dump do oráculo deduz pelo nome.
