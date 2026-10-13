# OG-068 — Opções do jogador

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S9 |
| Status | Em revisão |
| Dependências | [OG-060](OG-060-web-shell.md) |
| Regras de negócio | RN-NOM-01, RN-TIM-05 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero configurar nome, cores favoritas, controles, gráficos, som e idioma.

## Contexto e referências no original
- `Menu_player`, `Menu_game`, `Menu_graphics`, `Menu_theme`, `Menu_sounds`, `Menu_language`, `Menu_quickMessages` (`client_menus.h`).
- `config/client.cfg`.

## Escopo
- Opções persistidas localmente (convidado) e na conta (logado).
- Mensagens rápidas (quick messages).
- Seletor de idioma (en, pt-BR, fi, it) usando `@outgun/i18n`; padrão por `detectLocale(navigator.languages)` (vindo do OG-014).

## Critérios de aceite
- [x] Todas as opções relevantes do original disponíveis; as irrelevantes na web (modo de vídeo, joystick Allegro) documentadas como removidas.

## Notas técnicas
- —

## Notas de implementação
- Spec com o inventário completo (implementada / removida / pendente): [`plan/specs/opcoes-jogador.md`](../specs/opcoes-jogador.md). Decisão **D-26** (nomes "na mesma sala" por padrão); demais padrões = `client.cfg` distribuído (D-05).
- **Menus** (`apps/web/src/screens/options.tsx`), como o `Menu_options`: Opções do jogador (nome do convidado, cores favoritas com o `Colorselect` — ←/→ escolhe, Ctrl+←/→ ou +/− leva a cor —, cor aleatória, situação do registro, participar do ranking), Opções de jogo (predição, banda do minimapa, mensagens de bandeira/morte, estatísticas após a rodada, info do servidor, pular mapas), Mensagens rápidas (Alt+1..0), Controles (OG-063), Tema e fonte (tema, tema de cores, preferir cores do tema), Gráficos (nomes, salas na tela, texturas contínuas, limite de FPS), Som (ligado, volume, tema) e Idioma.
- **Na partida**: favoritas (se não for cor aleatória) e `minimapBandwidth` (cps/20) enviadas ao entrar e a cada mudança; filtros do feed como `netKill`/`netFlag*` (captura sempre aparece); mensagem rápida com o chat vazio (envia ou só preenche); nomes never/same room/always (`showName`); `maxFPS` do PixiJS; tema de som; tema de cores no `loadRoomTheme`.
- **Persistência**: navegador sempre; com conta, `GET|PUT /account/settings` (até 16 KiB, favoritas espelhadas em `player_profiles.favorite_colors`): ao entrar valem as da conta (na primeira vez, as do navegador sobem); mudanças gravadas com 1 s de espera (`PrefsSync`).
- **Removidas** (documentadas na spec): modo de vídeo, joystick da Allegro (gamepad do navegador, D-15), layout de teclado, arquivos de mensagens/estatísticas, senha de ranking, senhas por servidor, lista de servidores ao iniciar, relatório de bugs, nome aleatório.
- **Pendentes** → card novo **OG-070** (Backlog): opções gráficas finas, "stay dead", sublinhar contas, fundo dos menus. "Show stats after the round", "Show server info" e "Skip maps" já são preferências; as telas são do OG-066.
- Prova: `apps/web/src/screens/options.test.ts`, `feed.test.ts` (filtros), `apps/api/src/routes/ranking.test.ts` (opções na conta). E2E no Chrome: favoritas [5, 3, ...] → o servidor trocou a cor do jogador de 7 para 5; Alt+1 enviou "vamos!" na hora. Prints em `tools/parity/out/prints/068-*.png`.
