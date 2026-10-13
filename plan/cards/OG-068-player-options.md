# OG-068 — Opções do jogador

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S9 |
| Status | Pronto |
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
- [ ] Todas as opções relevantes do original disponíveis; as irrelevantes na web (modo de vídeo, joystick Allegro) documentadas como removidas.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
