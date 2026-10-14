# Outgun Web

Port para o navegador do [Outgun](http://outgun.sf.net/) 1.0.3, o jogo de captura de bandeira 2D
multiplayer criado por Fabiana Cecin e continuado por Niko Ritari, Jani Rivinoja e colaboradores. A
simulação é fiel ao original (comparada quadro a quadro com o jogo compilado), com partidas online,
contas, ranking, bots, replays e espectador.

## Estrutura

| Pasta       | Conteúdo                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------ |
| `apps/`     | `web` (cliente React + PixiJS), `game-server` (uWebSockets.js), `api` (Fastify + Postgres) |
| `packages/` | simulação, protocolo, netcode, bots, conteúdo (mapas), settings, i18n e afins              |
| `tools/`    | conversão de assets, oráculo do jogo original e paridade, E2E, carga, observabilidade      |
| `deploy/`   | imagens Docker, homologação local e deploy em uma VPS                                      |
| `_legacy/`  | o Outgun 1.0.3 original (C++/Allegro), intocado: referência do port e fonte dos assets     |

## Começando

```bash
corepack enable
pnpm install
pnpm assets      # converte mapas, gráficos, sons e fontes de _legacy/ para o cliente
pnpm verify      # o mesmo que o CI roda
```

Comandos, pacotes e o ambiente de desenvolvimento estão em [DEVELOPMENT.md](DEVELOPMENT.md); como
publicar numa VPS, em [deploy/vps/README.md](deploy/vps/README.md).

## Licença

GNU GPL 2 ou posterior ([COPYING](COPYING)), como o original. Créditos em [CREDITS.md](CREDITS.md).

## Como foi feito

O port foi planejado e executado em sprints, card a card: o plano, as regras de negócio, as decisões
e o quadro estão em [plan/PLAN.md](plan/PLAN.md), cada card em [plan/cards/](plan/cards/) e as
especificações extraídas do código original em [plan/specs/](plan/specs/). O fluxo de trabalho com o
Claude Code está em [CLAUDE.md](CLAUDE.md) e [.claude/skills/](.claude/skills/).
