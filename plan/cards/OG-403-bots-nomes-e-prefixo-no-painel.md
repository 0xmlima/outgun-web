# OG-403 — Bots no painel de moderação: nomes e prefixo

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S42 |
| Status | Pronto |
| Dependências | OG-377 |
| Regras de negócio | RN-NOM-01 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero cadastrar os nomes e o prefixo dos bots, para que as salas pareçam cheias de jogadores de verdade.

## Contexto
- Pedido do PO em 2026-10-23 (S42): "buscar uma simulação de jogo real".
- Hoje o nome sai de `createBotName` (`apps/game-server/src/bots.ts`: prefixo fixo `BOT `, sílabas de `names.cpp`). A IA reconhece outro bot pelo nome (`player.name.substring(0, 4) === 'BOT '` em `packages/bots/src/situation.ts`), então trocar o prefixo exige marcar o bot por uma flag, não pelo nome.

## Escopo
- Aba **Bots** na moderação (tela cheia, no padrão da S40): lista de nomes (adicionar, remover, colar vários de uma vez) e prefixo (padrão `BOT-`; pode ficar vazio). Nomes passam pelo `nameBlocked` (OG-276) e pelo limite de tamanho do nome.
- Gravado na API (configuração única) e entregue aos game servers como as rotações (OG-383); vale nos bots que entrarem depois.
- Game server: nome sorteado da lista sem repetir na sala e sem colidir com jogador presente; lista esgotada → gerador atual. A IA identifica bots por flag.

## Critérios de aceite
- [ ] Moderador cadastra nomes e prefixo, e o próximo bot que entra usa um deles.
- [ ] Nome proibido ou longo demais é recusado com mensagem.
- [ ] Prefixo trocado (ou vazio) não muda o comportamento da IA (teste).
- [ ] Ranked sem mudança (lá não há bots).

## Notas de implementação
