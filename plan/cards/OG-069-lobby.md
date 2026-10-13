# OG-069 — Lobby de salas

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S9 |
| Status | Concluído |
| Dependências | [OG-086](OG-086-room-registry.md) |
| Regras de negócio | RN-CFG-03, RN-PLT-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver salas abertas (jogadores, mapa, ping, ranqueada ou não) e entrar ou criar uma sala privada.

## Contexto e referências no original
- `Menu_serverList` (`client_menus.h:137`), master server (`servnet.cpp:2481-2580`).

## Escopo
- Abas/filtro por modo (**Casual** e **Ranked**); Ranked pede login antes de entrar.
- Lista de salas com filtros, ping por região, botão "Jogar agora" (matchmaking simples) por modo.
- Criar sala privada Casual (preset, senha, mapas); não existe sala privada Ranked.
- Link de convite.

## Critérios de aceite
- [x] Lista atualiza em tempo real (≤ 5 s).
- [x] Convidado entra em sala não ranqueada em ≤ 3 cliques.

## Notas técnicas
- —

## Notas de implementação
- **Telas** (`apps/web/src/screens/lobby.tsx`), no estilo de menu do `Menu_serverList`: `/rooms` (modo Casual/Ranked com ←/→, nome do convidado, "Jogar agora", "Criar sala privada", uma linha por sala com `jogadores/vagas`, mapa e ping da região; `*` = com senha; lotadas desabilitadas), `/rooms/new` (nome, regras = preset Casual, senha até 15, vagas pares 2..32 — Duelo fixo em 2 —, mapas: rotação oficial ou escolha) e `/rooms/:id` (página do link de convite: modo, jogadores, nome, senha, "Copiar link de convite").
- **Tempo real**: a lista é recarregada a cada 3 s (`GET /rooms?mode=`); com o heartbeat de 3 s do OG-086, uma entrada aparece no lobby em ≤ 6 s no pior caso e ~1–4 s no típico (medido: 1,4 s).
- **Ping por região**: `GET /regions` (novo) dá um `/health` de game server por região; o cliente mede 3 vezes e usa o menor (o `/health` ganhou CORS). A região de menor ping vai como preferência no "Jogar agora" e na criação de sala.
- **"Jogar agora"** (inicial = Casual; no lobby, do modo escolhido): `POST /rooms/quick-join` escolhe a sala e o jogo pede o próprio ticket ao entrar. Ranked sem conta → tela de login. Sem a API (desenvolvimento), o inicial cai na sala principal.
- **Senha** vai do lobby ao jogo pelo estado da navegação (nunca na URL) e vale para as reconexões. O convite passa a ser `WEB_URL/rooms/<id>` (a API ganhou `GET /rooms/:id`); a preferência `playerName` (nome do convidado) entra agora e é reaproveitada no OG-068.
- **Prova**: `apps/web/src/screens/lobby.test.ts`, `apps/api/src/routes/registry.test.ts` (convite e regiões). E2E com Chrome (API + game server + cliente): convidado no jogo com 2 cliques (início → Salas → Principal); entrada de outro jogador refletida no lobby em 1,4 s; dono cria sala com senha e joga; convidada entra pelo convite com a senha (2/16 no lobby). Prints em `tools/parity/out/prints/069-*.png`.
