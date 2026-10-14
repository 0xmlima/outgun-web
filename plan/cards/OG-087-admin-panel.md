# OG-087 — Painel admin

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S11 |
| Status | Concluído |
| Dependências | [OG-086](OG-086-room-registry.md), [OG-046](OG-046-chat-moderation.md) |
| Regras de negócio | RN-CHT-03, RN-CHT-04, RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero gerenciar salas, presets, jogadores e punições pelo navegador.

## Contexto e referências no original
- Admin shell e `srvmonit` do original (`servnet.cpp:2771-2990`, `src/tools/srvmonit.cpp`), `doc/admin.html`, `doc/srvmonit.html`.

## Escopo
- Lista de salas ao vivo com jogadores; kick/ban/mute; mensagens do servidor.
- CRUD de presets Casual; o preset Ranked só muda por decisão do PO (versionado, com auditoria). Gestão das rotações de mapas Casual e Ranked.
- Log de auditoria; papéis (admin, moderador).

## Critérios de aceite
- [x] Toda ação gera registro de auditoria.
- [x] Acesso restrito por papel com testes.

## Notas técnicas
- —

## Notas de implementação
- Decisão D-34 (delegada): comandos e configuração do painel vão aos game servers na resposta do heartbeat (≤ 3 s) e a confirmação volta no seguinte; sem porta de controle nova nos game servers.
- Migration `0010_admin_panel` (reversível): `users.is_moderator`, `rooms.roster` (jogadores do último heartbeat), `admin_commands`, `casual_presets` + `casual_preset_versions`, `map_rotations`.
- API `/admin/*` (`apps/api/src/routes/admin.ts`): moderador — salas ao vivo, comandos kick/ban de sala (1 min a 7 dias)/mute/unmute/mensagem, andamento do comando, denúncias (fechar), bans (listar, revogar os de sala), auditoria; admin — também mensagem a todas as salas, ban de plataforma (pela sala ou por conta/IP), presets Casual (criar/alterar versionado, desativar, histórico; os do jogo só leitura, 409 se tentar), rotações por modo e papéis (não o próprio). Toda ação grava em `admin_actions` (ação, autor, alvo, sala, motivo, duração, detalhes). `GET /presets` público lista os Casual para salas privadas, que passam a aceitar os do painel. `apps/api/src/platform-config.ts`: config versionada, fila de comandos e confirmações (ban criado com conta/IP/dispositivo).
- Game server: `Room.roster()`, `Room.remoteCommand()` (mesmas ações do console, autor = quem usou o painel), `Room.setRotation()` (entra na próxima troca de mapa, votos zerados), `presets.ts` (presets do painel; salas abertas depois usam), `panel.ts` (executa comandos, guarda confirmações, aplica a config quando a versão muda).
- Cliente: `AdminScreen` (carregada só ao abrir `/admin`), abas Salas ao vivo, Denúncias, Bans, Auditoria, Presets, Rotações, Papéis (admin); textos em pt-BR.
- Testes: `admin.test.ts` (cada uma das 14 rotas: sem sessão 401, jogador 403, moderador só as suas, admin todas; ciclo comando → heartbeat → confirmação → ban; presets versionados/validados/entregues; rotação, mensagem geral, ban de plataforma e papéis auditados), `panel.test.ts` (game server), `settings.test.ts` (validação de preset) e E2E `admin.spec.mjs` (convidado jogando; Admin silencia e expulsa pelo painel; o jogador cai; auditoria mostra as duas ações). Prints em `tools/parity/out/prints/og087/`.
- Achado no caminho: o cache do turbo não considerava arquivos fora do pacote (traces, mapas) e escondia uma falha do `settings.test.ts` desde a S10 (os traces `*.bots.jsonl.gz` não têm cabeçalho de configuração); teste corrigido e `turbo.json` passa a declarar essas pastas como entrada dos testes. Rodando tudo sem cache (como o CI), testes de partida/replay simulados do game server e dos bots passavam dos 5 s padrão do Vitest; `vitest.config.ts` nesses dois pacotes sobe o limite para 30 s. `pnpm turbo run test --force`: 24/24 verdes.
- Fica para depois: moderador não tem comandos no chat do jogo (o `/kick` etc. continua só para admin, como no OG-046).
