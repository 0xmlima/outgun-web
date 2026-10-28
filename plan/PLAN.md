# Outgun Web — Plano do Projeto

> Port do **Outgun 1.0.3** (C++/Allegro, CTF 2D multiplayer até 32 jogadores) para um jogo **web, online, jogável no navegador**, com cadastro, ranking e paridade de regras com o original.
>
> **v2 (desde 2026-10-14):** o port terminou (S0–S12). Daqui em diante o jogo evolui por conta própria, sem exigência de fidelidade ao original — ver a [seção 15](#15-v2--o-jogo-segue-seu-próprio-caminho).
>
> Este arquivo é a fonte única de verdade do projeto: visão, stack, arquitetura, **regras de negócio**, metodologia ágil, roadmap e índice de cards. Os detalhes de cada card ficam em [`cards/`](cards/).

---

## Sumário

0. [Como usar este documento](#0-como-usar-este-documento)
1. [Visão do produto](#1-visão-do-produto)
2. [Diagnóstico do código original](#2-diagnóstico-do-código-original)
3. [Skills de engenharia reversa](#3-skills-de-engenharia-reversa)
4. [Stack tecnológica](#4-stack-tecnológica)
5. [Arquitetura alvo](#5-arquitetura-alvo)
6. [Regras de negócio](#6-regras-de-negócio)
7. [Requisitos não funcionais](#7-requisitos-não-funcionais)
8. [Metodologia ágil](#8-metodologia-ágil)
9. [Épicos e roadmap](#9-épicos-e-roadmap)
10. [Backlog — índice de cards](#10-backlog--índice-de-cards)
11. [Riscos](#11-riscos)
12. [Decisões em aberto](#12-decisões-em-aberto)
13. [Glossário](#13-glossário)
14. [Mapa do código-fonte original](#14-mapa-do-código-fonte-original)
15. [v2 — o jogo segue seu próprio caminho](#15-v2--o-jogo-segue-seu-próprio-caminho)

---

## 0. Como usar este documento

**Para humanos (PO / devs):**
1. Leia as seções 1, 4, 5 e 8 para entender o produto, a stack e o processo.
2. O quadro do sprint está na [seção 10](#10-backlog--índice-de-cards). A coluna **Status** é atualizada a cada mudança de estado de um card.
3. Cada card em `cards/OG-XXX-*.md` traz história, referências ao código original, critérios de aceite e regras de negócio (RN) relacionadas.

**Para agentes (Claude Code):**
1. Antes de qualquer card, use a skill `outgun-card-workflow` (`.claude/skills/outgun-card-workflow`).
2. Cards de conteúdo/assets (temas, mapas, música) usam a skill `outgun-asset-pipeline`.
3. **v1 (S0–S12):** cards de port exigiam `outgun-re-spec` e cards da simulação, `outgun-parity-harness`. **Na v2 essas duas skills estão desativadas** (`.claude/skills-disabled/`): o original é referência opcional.

**Regra de ouro (v1):** quando o código original e a documentação HTML (`doc/`) divergirem, **o código vence** — registre a divergência na spec e em [Decisões em aberto](#12-decisões-em-aberto).

---

## 1. Visão do produto

### 1.1 Declaração de visão
Levar o Outgun para o navegador sem instalação, mantendo a sensação de jogo do original (física, armas, power-ups, CTF) e adicionando o que uma plataforma web moderna espera: contas, ranking persistente, lobby de salas, replays compartilháveis.

### 1.2 Objetivos
| # | Objetivo | Métrica de sucesso |
|---|----------|--------------------|
| O1 | Paridade de gameplay | Testes de paridade (golden traces) passando para física, tiro, dano, power-ups e bandeiras; jogadores veteranos validam a sensação de jogo no beta |
| O2 | Multiplayer online estável | 32 jogadores numa sala, tick de 10 Hz sem atraso, p95 do tempo de tick < 5 ms |
| O3 | Plataforma | Cadastro/login, perfil, ranking com temporadas, histórico de partidas |
| O4 | Acesso | Roda nos navegadores atuais (Chrome, Firefox, Safari, Edge) em desktop; carga inicial < 5 MB |

### 1.3 Escopo
**Dentro do escopo (paridade com o original):**
- Modo CTF por equipes (vermelho × azul) com bandeiras de time e bandeiras selvagens (verdes).
- Física, armas (1 a 9 foguetes), 7 power-ups, deathbringer, colisões especiais.
- Todos os mapas de `maps/` e `cmaps/`, formato de mapa original e gerador de mapas aleatórios.
- Rotação e votação de mapas, troca e balanceamento de times, chat (geral e de time), comandos `/`, moderação (kick/ban/mute), idle kick.
- Bots.
- Estatísticas por jogador e por time (telas F3/F4), placar, minimapa.
- Replays e modo espectador.
- Temas gráficos, tema de som, fontes, 4 idiomas (en, fi, it, pt-BR).
- Configuração de servidor (gamemod) → **presets de sala**.

**Novo na versão web:**
- **Dois modos de jogo** (divergência D-10): **Casual**, com power-ups e presets variados, aberto a convidados; e **Ranked**, obrigatoriamente **sem power-ups**, só para jogadores com conta, e o único que conta para o ranking.
- Contas com nome de usuário + senha e e-mail para recuperação de senha; clan tag.
- Ranking global persistente com temporadas.
- Lobby de salas públicas/privadas e matchmaking simples.
- Painel admin web.

**Fora do escopo (v1):**
- Compatibilidade de rede com clientes/servidores C++ originais (protocolo UDP leetnet).
- Servidores hospedados pelo usuário em máquina própria (substituído por "salas privadas").
- Relay de replays ao vivo (`relay.cpp`), srvmonit e admin shell TCP (substituídos pelo painel admin).
- Joystick legado do Allegro (substituído pela Gamepad API).

### 1.4 Personas
- **Veterano**: jogou o Outgun original; exige física idêntica e mapas clássicos.
- **Casual**: chega por um link, quer jogar em 10 segundos como convidado.
- **Competitivo**: quer ranking, estatísticas, clã.
- **Admin/moderador**: gerencia salas, presets e punições.

---

## 2. Diagnóstico do código original

### 2.1 Visão geral
- ~52 mil linhas de C++ (pré-C++11, `throw ()` em tudo), arquivos em **ISO-8859-1 com CRLF**.
- Bibliotecas: Allegro 4 (gráficos, som, input), HawkNL (sockets), pthreads.
- Licença: **GNU GPL v2 ou posterior** (`COPYING`).
- Modelo de rede: **servidor autoritativo** a **10 frames/s** (1 frame = 0,1 s), UDP com camada confiável própria (`leetnet/rudp.cpp`). O cliente faz **extrapolação/predição** do próprio jogador usando um histórico circular de 256 controles (`ClientWorld::extrapolate`).

### 2.2 Módulos principais
| Arquivo | Linhas | Responsabilidade |
|---|---:|---|
| `src/world.cpp/.h` | 5,4k | **Núcleo da simulação**: mapa, paredes, física, foguetes, dano, power-ups, bandeiras, captura, estatísticas |
| `src/servnet.cpp/.h` | 4,1k | Rede do servidor: mensagens, frames por cliente, ranking HTTP, master server |
| `src/server.cpp/.h` | 2,5k | Lógica de servidor: pontuação, rotação/votação de mapas, times, comandos admin, idle kick |
| `src/server_settings.cpp` | 0,5k | **Registro de todas as configurações** (gamemod), com faixas válidas |
| `src/clientbase.cpp/.h` | 2,0k | Cliente: processamento de frames, predição, lag |
| `src/guiclient.cpp/.h` | 5,6k | Cliente gráfico: loop, input, HUD, menus in-game |
| `src/graphics.cpp/.h` | 4,2k | Renderização (procedural + texturas de tema) |
| `src/robot.cpp/.h`, `bot_support.*` | 2,8k | Bots (AreaMap, navegação, mira) |
| `src/mapgen.cpp` + `mapgen/*.txt` | 0,5k | Gerador de mapas aleatórios a partir de 60 blocos de sala |
| `src/auth.cpp/.h` | 0,3k | Nomes protegidos por senha, classes de admin, bans |
| `src/protocol.h` | 0,2k | Enum de mensagens de rede (`Network_data_code`) |
| `src/commont.h` | 0,4k | Constantes globais (tamanho da sala, raios, limites) |
| `src/client_menus.*`, `menu.*` | 3,4k | Menus (servidores, opções, controles, temas, idioma, replays) |
| `src/leetnet/*` | 3,0k | Transporte UDP confiável (não será portado) |
| `src/tools/*` | 2,4k | `mapconv`, `mapgen-main`, `relay`, `srvmonit` |

### 2.3 Assets e formatos
| Pasta | Formato | Conversão necessária |
|---|---|---|
| `maps/` (20), `cmaps/` (25) | Texto próprio (spec em `doc/maps.html`) | Parser TS; manter `.txt` como fonte |
| `mapgen/` (60) | Blocos de sala para o gerador | Parser TS |
| `graphics/<tema>/` (6 temas) | PCX 8/24 bits, magenta `#FF00FF` = transparente | PNG/WebP com canal alpha |
| `sound/Visa/` | WAV PCM 16 bits mono 22 kHz + `.txt` de alias | OGG/Opus + fallback AAC/MP3; resolver aliases |
| `fonts/` (25) | Datafile Allegro compactado (`slh.ALL`, LZSS) | Atlas de fonte bitmap (BMFont) |
| `languages/` | Texto próprio, chave = linha em `en.txt` | JSON i18n |
| `config/` | `gamemod.txt`, `client.cfg`, `auth.txt` | Presets de sala, defaults do cliente |
| `doc/` | HTML | Referência de regras e UI |

### 2.4 Pontos de atenção encontrados
- **Defaults divergentes**: os valores no código (`PhysicalSettings()`, `WorldSettings::reset()`, `PowerupSettings::reset()`) diferem do `config/gamemod.txt` distribuído (ex.: `friction` 0.20 no código × 0.45 no gamemod; `flag_return_delay` 1.0 × 0; `pups_player_max` ilimitado × 6). **A experiência "clássica" é a do gamemod distribuído** → ver RN-CFG-01.
- **Configurações não documentadas** existem em `server_settings.cpp` (`pup_team_*`, `carry_own_team_flag`, `capture_away_from_base` etc.). O registro de settings do código é a referência.
- **Times por índice**: o time do jogador é `pid / TSIZE` (metade dos slots para cada time). Na versão web, o time será um campo explícito.
- **Aleatoriedade** via `rand()`/`random_shuffle` da libc: para testes de paridade é preciso reproduzir o `rand()` da glibc em TS (ver skill `outgun-parity-harness`).
- **Mapa toroidal**: sair por uma borda leva à borda oposta (`positiveModulo`), salvo paredes.
- Código de compatibilidade com protocolos antigos (`protocolExtensionsLevel < 0`) deve ser **ignorado**.

---

## 3. Skills de engenharia reversa

O repositório não tinha nenhuma skill. Adicionamos quatro em `.claude/skills/`, focadas em reduzir o principal risco do projeto: **divergência silenciosa de regras**.

| Skill | Quando usar | O que entrega |
|---|---|---|
| [`outgun-re-spec`](../.claude/skills/outgun-re-spec/SKILL.md) | Antes de portar qualquer comportamento | Spec em `plan/specs/<tema>.md` com citações `arquivo:linha`, constantes, pseudocódigo, ordem no frame, casos de borda e vetores de teste |
| [`outgun-parity-harness`](../.claude/skills/outgun-parity-harness/SKILL.md) | Cards do épico E2 (simulação) e OG-003/OG-100 | Build do original em Docker, gravação de golden traces (JSONL) e comparação com a sim TS |
| [`outgun-asset-pipeline`](../.claude/skills/outgun-asset-pipeline/SKILL.md) | Cards de conteúdo (E1) | Conversão PCX/WAV/DAT/idiomas e manifesto de assets |
| [`outgun-card-workflow`](../.claude/skills/outgun-card-workflow/SKILL.md) | Sempre, ao pegar/fechar um card | Fluxo de status, DoR/DoD, convenções de branch/commit |

> **v2 (2026-10-14):** `outgun-re-spec` e `outgun-parity-harness` foram desativadas (movidas para `.claude/skills-disabled/`, com instruções para reativar). Seguem ativas `outgun-card-workflow` (revisada para a v2) e `outgun-asset-pipeline` (agora também para a trilha sonora).

**Ferramentas complementares recomendadas** (não são skills): `clangd`/`ctags` para navegar no C++; `bear` + `compile_commands.json` gerado no build Docker (OG-002) para "go to definition" confiável.

---

## 4. Stack tecnológica

### 4.1 Recomendação
**TypeScript de ponta a ponta**, num monorepo. O motivo decisivo é que **a mesma simulação roda no servidor (autoritativa) e no cliente (predição)**, exatamente como no original (`WorldBase` compartilhado entre `ServerWorld` e `ClientWorld`). Uma única base de código para a física elimina a classe de bugs "cliente e servidor discordam".

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Pacotes compartilhados (`sim`, `protocol`, `content`) com build incremental |
| Simulação | `packages/sim` — TS puro, sem dependências, determinístico, RNG injetável | Roda em Node e no browser; testável isoladamente |
| Game server | Node.js 22 LTS + **uWebSockets.js** (alternativa: `ws`) | WebSocket binário de alto desempenho; uma sala por loop, várias salas por processo, `worker_threads` para escalar |
| Protocolo | Binário próprio (`packages/protocol`, DataView), versionado | Pacotes pequenos a 10 Hz; mapeamento direto do `Network_data_code` original |
| Transporte | WebSocket (v1); avaliar **WebTransport** com datagramas (v2) | WS funciona em todo lugar; a 10 Hz o head-of-line blocking do TCP é aceitável |
| API de plataforma | **Fastify** + **Drizzle ORM** + **PostgreSQL 16** | Contas, ranking, partidas, salas; tipagem ponta a ponta |
| Cache/tempo real | **Redis** (opcional) | Contadores de limite de taxa com várias instâncias da API; o registro de salas (substitui o master server) fica no PostgreSQL (D-24) |
| Auth | Sessões em cookie httpOnly + argon2id (lib Better Auth ou implementação própria); usuário + senha, e-mail só para recuperação (D-10); e-mail transacional via SMTP/provedor (Resend, SES ou similar) | Seguro e simples; game server recebe ticket JWT de curta duração |
| Front-end (UI) | **Vite + React 18** + React Router + TanStack Query + Zustand | Menus, lobby, perfil, ranking, opções |
| Render do jogo | **PixiJS v8** (WebGL/WebGPU) num `<canvas>` | Só renderização 2D rápida; o React **não** participa do loop do jogo |
| Áudio | Web Audio API (wrapper fino ou Howler.js) | Baixa latência, controle de volume por categoria |
| i18n | i18next | 4 idiomas do original |
| Testes | Vitest (unit/paridade), Playwright (E2E), k6 ou Artillery (carga WS) | |
| Observabilidade | pino (logs), Prometheus/Grafana (métricas de tick), Sentry (erros cliente/servidor) | |
| Infra | Docker; Fly.io (regiões, bom para WebSocket) ou VPS (Hetzner) + Caddy; Postgres gerenciado (Neon/Supabase/RDS) | |
| CI/CD | GitHub Actions | lint, typecheck, testes, paridade, build de imagens |

### 4.2 Alternativas consideradas
| Alternativa | Prós | Contras | Veredito |
|---|---|---|---|
| **Colyseus** (framework de salas Node) | Salas, matchmaking e reconexão prontos | Sincronização de estado genérica (schema delta) foge do modelo de frames de 10 Hz + AOI por sala; menos controle do protocolo | Plano B para OG-040 se o time preferir velocidade a controle |
| **Rust/Go no servidor + sim em WASM** | Performance, tipagem forte | Dois ecossistemas; a sim precisaria existir em WASM para o cliente; 32 jogadores a 10 Hz não exigem isso | Não recomendado para v1 |
| **Compilar o C++ original com Emscripten** | Paridade "grátis" | Código acoplado a Allegro, pthreads, sockets e `server.h` dentro de `world.cpp`; difícil de manter e estender | Usar o original **apenas como oráculo de testes** (OG-002/003) |
| **Godot/Unity (export web)** | Editor, ferramentas | Bundle pesado, UI web (cadastro/ranking) fica fora do motor, menos controle de rede | Não recomendado |
| **Phaser** em vez de PixiJS | Cenas, input, áudio inclusos | Traz física e loop que não usaremos | PixiJS é mais enxuto para "só render" |
| **Next.js** em vez de Vite | SSR/SEO para páginas públicas de ranking/perfil | Complexidade extra para uma SPA de jogo | Opcional depois: páginas públicas de ranking podem ser SSR |

---

## 5. Arquitetura alvo

### 5.1 Visão de componentes
```
                ┌──────────────────────────── Navegador ────────────────────────────┐
                │  React (menus, lobby, perfil, ranking, opções, chat UI)            │
                │        │                                                           │
                │        ▼                                                           │
                │  GameClient ── packages/sim (predição) ── PixiJS renderer ── Audio │
                └───────┬───────────────────────────────┬────────────────────────────┘
                   HTTPS│REST/JSON                       │WSS binário (10 Hz)
                        ▼                                ▼
              ┌──────────────────┐   ticket JWT   ┌─────────────────────────┐
              │  apps/api        │◄──────────────►│ apps/game-server (N)    │
              │  Fastify         │   resultados   │ salas, loop 10 Hz,      │
              │  auth, ranking,  │◄───────────────│ packages/sim autoritativa│
              │  salas, admin    │                │ bots, replays           │
              └──┬──────────┬────┘                └──────────┬──────────────┘
                 │          │                                │ heartbeat/registro
                 ▼          ▼                                ▼
            PostgreSQL     Redis  ◄──────────────────────────┘
            (contas,       (sessões, registro de salas, leaderboards, pub/sub)
             partidas,
             ranking)      Object storage (replays, assets versionados)
```

### 5.2 Layout do monorepo
O monorepo fica **na raiz deste repositório, ao lado do código original** (decidido no OG-001): assim todas as referências `src/...`, `maps/...` do plano, das specs e das skills continuam válidas, e o original não é movido nem alterado.
```
./                    # raiz: código original intocado (src/, maps/, cmaps/, config/, graphics/, sound/, fonts/, languages/, doc/...)
├─ package.json       # workspace pnpm + Turborepo
├─ apps/
│  ├─ web/            # Vite + React + PixiJS
│  ├─ game-server/    # Node + uWebSockets.js
│  └─ api/            # Fastify + Drizzle
├─ packages/
│  ├─ sim/            # simulação determinística (núcleo portado de world.cpp)
│  ├─ protocol/       # mensagens binárias, encoder/decoder, versão
│  ├─ content/        # parser de mapas, gerador, manifesto de assets
│  ├─ settings/       # schema de configurações (gamemod) + presets
│  └─ i18n/           # traduções
├─ tools/
│  ├─ asset-pipeline/ # conversores PCX/WAV/DAT/idiomas
│  └─ parity/         # oráculo Docker + harness de golden traces
└─ plan/              # este plano, cards e specs
```
> Patches no original (para o oráculo/harness) ficam em `tools/parity/patches/` e são aplicados só dentro do container.

### 5.3 Modelo de rede (preserva o original)
- **Tick do servidor:** 10 Hz (100 ms), igual ao original. Todas as durações configuradas em segundos são convertidas para frames (`× 10`).
- **Entrada do cliente:** a cada frame o cliente envia um byte de controles (bitmask: cima, baixo, esquerda, direita, correr, strafe) + flags de tiro + número de sequência. Nunca posição.
- **Snapshot por cliente:** número do frame, eco da última entrada processada, dados completos dos jogadores **na mesma sala**, posições de minimapa limitadas (`minimap_send_limit`), vida/energia do próprio jogador. Eventos (kill, captura, power-up, som) como mensagens confiáveis.
- **Interesse por sala (AOI):** o cliente só recebe detalhes de quem está na mesma sala (e foguetes até `see_rockets_distance` salas). Isso preserva o power-up shadow e evita "wallhack".
- **Cliente:** renderiza a 60+ fps, interpolando entidades remotas entre os dois últimos snapshots e **predizendo** o próprio jogador com `packages/sim` + histórico de entradas não confirmadas (reconciliação ao receber o snapshot).

### 5.4 Fluxo de entrada na partida
1. Usuário (logado ou convidado) escolhe uma sala no lobby → `POST /rooms/:id/join` na API.
2. API valida (senha da sala, ban, capacidade) e devolve `{ wsUrl, ticket }` (JWT, 60 s, contém userId, nick, flags de ranking).
3. Cliente abre WSS no game server com o ticket; o servidor valida a assinatura e aloca o time (RN-TIM-01).
4. Ao fim da partida o game server envia o resultado assinado para a API (`POST /internal/matches`), que atualiza ranking e histórico.

---

## 6. Regras de negócio

> Convenções: **frame** = 0,1 s. Distâncias em pixels lógicos. Sala = **472 × 354** px (`plw`, `plh`, `src/commont.h:282`). Valores entre parênteses são os do **preset Clássico** (gamemod distribuído). Cada RN cita a fonte; cards referenciam RNs pelo ID.

### 6.0 Modos de jogo (RN-MOD) — divergência intencional D-10
O original tem um único modo, configurado pelo gamemod do servidor. A versão web separa dois modos:
- **RN-MOD-01** — **Casual**: salas criadas a partir de qualquer preset Casual (padrão: **Clássico** = `config/gamemod.txt`, com power-ups). Aberto a convidados e contas. Não altera o ranking.
- **RN-MOD-02** — **Ranked**: salas usam somente o preset **Ranked** = Clássico **sem power-ups**: `pups_min 0`, `pups_max 0`, todos os `pup_start_*` desligados (`pup_start_weapon 1`), `pups_drop_at_death 0`. Nenhum power-up aparece, é dado no spawn ou largado; o resto das regras (física, tiro, bandeiras, pontuação) é idêntico ao Clássico.
- **RN-MOD-03** — Ranked exige **conta logada** (nome de usuário + senha). Convidados não entram em salas Ranked.
- **RN-MOD-04** — O preset Ranked é **travado**: nem dono de sala nem `/set` alteram settings; mapas vêm da rotação oficial Ranked; não há salas Ranked privadas com regras próprias. **v2 (D-44):** salas Ranked podem ter senha, mas as regras continuam travadas (RN-RKL-06).
- **RN-MOD-05** — Só partidas Ranked alimentam o ranking (RN-RNK). Estatísticas de partidas Casual podem aparecer no perfil, separadas.
- **RN-MOD-06** — Bots são proibidos em salas Ranked (D-11; **exceção v2:** bot substituto após queda, RN-RKL-19, D-46): o servidor não adiciona bots, recusa comandos que os ativem e o preset Ranked trava `min_bots` e `bots_fill` em 0. No Casual os bots continuam como no original.

### 6.1 Mapa e mundo (RN-MAP)
- **RN-MAP-01** — O mapa é uma grade de `width × height` salas; cada sala tem 472×354 px. Coordenadas: `(sala.x, sala.y, x local, y local)`. (`world.h:53-95`)
- **RN-MAP-02** — O mundo é **toroidal**: ao cruzar uma borda da sala o jogador entra na sala vizinha; ao cruzar a borda do mapa, entra na sala do lado oposto. (`world.cpp:2780-2825`, `positiveModulo`)
- **RN-MAP-03** — Formato de mapa: comandos `P width/height/title/author` (obrigatórios: width, height, title), `S` (escala), `R` (sala ativa), `:label` + `X` (grupos reutilizáveis), `W`/`G` retângulo, `T W/G` triângulo, `C W/G` círculo/anel/setor (ângulo 0 = topo, horário), `flag team rx ry x y`, `spawn team rx ry x y`, `V respawn ...` (áreas de respawn). Times: 0 = vermelho, 1 = azul, 2 = selvagem/ambos. Comentários com `;`. (`doc/maps.html`, `world.cpp:375-775`)
- **RN-MAP-04** — Texturas de chão 0–7 (normal1–3, red, blue, ice, sand, mud) e de parede 0–7 (normal1–3, red, blue, metal, wood, rubber). **Texturas não afetam a física.**
- **RN-MAP-05** — Bandeiras e spawns não podem estar sobre paredes; áreas de respawn não podem estar totalmente sobre paredes. Mapa inválido é rejeitado com erro legível (equivalente a `data_broken_map`).
- **RN-MAP-06** — Mapas aleatórios: `random_map w h p` gera mapa com blocos de `mapgen/`, com simetria (vertical, horizontal ou rotacional) e opção de bandeira verde. (`mapgen.cpp`)

### 6.2 Física (RN-FIS)
Ordem por frame para cada jogador vivo (`WorldBase::applyPlayerAcceleration`, `world.cpp:1209`):
- **RN-FIS-01** — `accel = acceleration (2.00)`; × `turbo_acceleration (1.45)` com turbo; × `run_acceleration (1.70)` correndo; correndo **e** carregando bandeira inimiga ou selvagem: × `flag_acceleration (0.90)` adicional.
- **RN-FIS-02** — Arrasto: `vel *= 1 − drag (0.10)`.
- **RN-FIS-03** — Atrito constante: se `|vel| ≤ friction (0.45)` ou `|vel| < 0.001` → `vel = 0`; senão `vel *= 1 − friction/|vel|`.
- **RN-FIS-04** — Jogador sob efeito de deathbringer não acelera (só desliza).
- **RN-FIS-05** — Direção: `side = direita − esquerda`, `forw = cima − baixo`; diagonal normalizada por √2. Modo mundo (padrão): `acc = (side, −forw)`. Com `free_turning` e o jogador em modo arma: aceleração relativa à direção da arma.
- **RN-FIS-06** — Se o jogador está em movimento, a aceleração é decomposta em componente paralela e perpendicular à velocidade: frear (paralela oposta) × `brake_acceleration (1.00)`; virar (perpendicular) × `turn_acceleration (1.00)`. `vel += acc × accel`.
- **RN-FIS-07** — Velocidade máxima de corrida: `max_run_speed = (run_mul × accel − fric) / drag`, **calculada só no construtor com os defaults do código** e nunca recalculada após o gamemod. No servidor vale sempre **27,1875**, mesmo no preset Clássico, cujo valor pela fórmula seria 29,5; comportamento preservado. Limite rígido de velocidade: `max_run_speed × turbo_mul × 4`; o dano por colisão (RN-FIS-11) também normaliza por esse valor. (`world.cpp:1446-1450, 2559, 2734`; confirmado nos traces, OG-030)
- **RN-FIS-08** — Raio do jogador 15 px; shield adiciona 9 px ao raio visual/colisão de escudo; foguete 4 px (power: 6 px); power-up e bandeira 15 px. (`commont.h:284-286`, `world.h:39`)
- **RN-FIS-09** — Colisão com paredes por tempo-de-impacto contínuo (sub-frame) com retângulos, triângulos e círculos/anéis/setores; o jogador quica (reflexão). (`world.cpp:1069-1165, 2826-3050`)
- **RN-FIS-10** — Colisão entre jogadores: `player_collisions` = `no` (atravessam), `normal` (quicam), `special` (quicam + efeitos da RN-FIS-11). Jogadores em proteção de spawn não colidem.
- **RN-FIS-11** — Efeitos especiais de colisão (só em `special`, `world.cpp:2545`): shadow fica visível ao colidir com inimigo e compartilha 3 s de shadow com aliado (se tiver mais de 3 s); turbo arremessa o outro (força ×2); portador de deathbringer "infecta" inimigo por 1 s; shield causa dano `60 × velocidade relativa` (normalizada pela máxima); power sem shield causa dano `80 × velocidade` a inimigo sem shield/power ("humilhação").

### 6.3 Tiro e foguetes (RN-TIR)
- **RN-TIR-01** — Tiro exige `frame ≥ next_shoot_frame`. Custo: `shooting_energy_base (7)`; cada foguete extra custa `shooting_energy_per_extra_rocket (1)` enquanto houver energia; sem energia sai **um** foguete só. (`world.cpp:3180-3200`)
- **RN-TIR-02** — Intervalo entre tiros: `shoot_interval_with_energy (0.5 s)` se ainda há energia, senão `shoot_interval (0.5 s)`.
- **RN-TIR-03** — Nível de arma 1–9 define a formação: 1→1 frontal; 2→2 paralelos; 3→3 paralelos; 4→2 + ±1 direção; 5→3 + ±2; 6→2 + ±1, ±2; 7→3 + ±2, ±3; 8→2 + ±1, ±2, ±3; 9→3 + ±1, ±2, ±3 (unidade = 1 octante = 45°, via `GunDirection.adjust`; nível 9 atira em leque quase completo). (`world.cpp:1377`)
- **RN-TIR-04** — Velocidade do foguete: `rocket_speed (50)` px/frame. O foguete nasce avançado 15 px (não acerta quem está colado). Foguetes paralelos deslocados lateralmente `PLAYER_RADIUS + ROCKET_RADIUS − 2` px.
- **RN-TIR-05** — Dano: `rocket_damage (70)`; foguete power × `pup_power_damage (2.0)`; aliado × `friendly_fire (0)`. Acertar aliado não conta como acerto nas estatísticas.
- **RN-TIR-06** — Foguete que acerta empurra o alvo: `vel += vel_foguete × 15 / rocket_speed` (× friendly_fire para aliado).
- **RN-TIR-07** — Ser atingido (exceto por colisão) trava a arma por `hit_stun_time (1.0 s)`.
- **RN-TIR-08** — Foguete some ao bater em parede ou sair do mapa. Máximo 256 foguetes simultâneos.
- **RN-TIR-09** — Atirar revela o jogador com shadow (visibilidade máxima momentânea).
- **RN-TIR-10** — Direção da arma: 8 direções pelo teclado; strafe mantém a direção; com `free_turning` a direção é contínua (precisão 1/256 de octante na rede).

### 6.4 Vida e energia (RN-VID)
- **RN-VID-01** — Spawn com `start_health (100)` e `start_energy (100)`; máximos `health_max (300)`, `energy_max (300)`.
- **RN-VID-02** — Regeneração por frame (0,1 s), em ordem de prioridade, consumindo o tempo do frame: vida 0→100 a 10/s; energia 0→100 a 10/s; energia 100→200 a 5/s; vida 100→200 a 1/s; energia 200→max a 0/s; vida 200→max a 0/s. Sem regeneração durante efeito de deathbringer. (`world.cpp:3087`)
- **RN-VID-03** — Correr consome energia a `run_energy_degradation (15/s)`; sem energia, consome vida a `run_health_degradation (15/s)` até o piso `min_health_for_run_penalty (40)`.
- **RN-VID-04** — Shield: dano vai para a **energia**; se energia ≤ 0, perde o shield. Com `pup_shield_one_hit = N > 0`, o shield aguenta N acertos.
- **RN-VID-05** — Megahealth: bônus `pup_health_bonus (160)` distribuído 5 pontos/frame alternando vida e energia até os máximos; bônus não acumula quando vida e energia estão no máximo.

### 6.5 Power-ups (RN-PUP)
> Valem para o modo **Casual**. No modo **Ranked** não há power-ups (RN-MOD-02).
- **RN-PUP-01** — Tipos e pesos de sorteio: shield 16, turbo 14, shadow 14, power 14, weapon 18, megahealth 13, deathbringer 11. (`world.cpp:1541`)
- **RN-PUP-02** — Quantidade no mapa: mínimo = `max(pups_min, nº de jogadores)` limitado a `pups_max`; percentuais são relativos ao nº de salas (`pups_min 20%`, `pups_max 80%`, máximo absoluto 32). Reaparecem após `pups_respawn_time (25 s)`.
- **RN-PUP-03** — Local de spawn: sala aleatória sem jogadores e sem outros power-ups (relaxa após tentativas), posição longe de paredes.
- **RN-PUP-04** — Coleta por toque (raio 15 + 15). Jogador sob deathbringer não coleta.
- **RN-PUP-05** — Efeitos: **shield** (vida mínima 100, +100 energia até 200); **turbo**, **shadow**, **power** — tempo `+pup_add_time (40 s)` acumulável até `pup_max_time (100 s)`; **weapon** (+1 nível até `pup_weapon_max (9)`, +100 energia até 200); **megahealth** (RN-VID-05); **deathbringer** (liga; com `pup_deathbringer_switch` pegar de novo **desliga**).
- **RN-PUP-06** — Limite `pups_player_max (6)` power-ups simultâneos; ao exceder, descarta o "pior": primeiro o temporizado que expira antes (turbo/shadow/power), depois deathbringer, depois shield, depois arma volta a 1.
- **RN-PUP-07** — Shadow: visibilidade cai 10/frame até o mínimo (7 de 255); atirar, pegar bandeira ou levar dano revela.
- **RN-PUP-08** — `pups_drop_at_death`: ao morrer, larga um power-up. `pup_team_*`: o power-up é aplicado a todos os aliados vivos.
- **RN-PUP-09** — Power-ups iniciais configuráveis (`pup_start_*`).

### 6.6 Deathbringer (RN-DB)
- **RN-DB-01** — Ao morrer carregando deathbringer, cria uma explosão na posição da morte; raio: `t = frames/10`; `t < 1 → 100·t`; senão `100 + 800·(t−1)²`; expira após 18 frames. (`world.cpp:1421`)
- **RN-DB-02** — Atinge jogadores da **mesma sala** quando o anel passa por eles (inimigos; aliados só se `friendly_deathbringer > 0`). Efeito: duração `pup_deathbringer_time (5 s) × [0,9–1,1)` (× friendly_db para aliados), arma travada pelo mesmo tempo, empurrão com velocidade 40 para fora do centro, dano de 3/frame (12/frame se tiver shield).
- **RN-DB-03** — Portador de deathbringer: vida/energia acima de 100 degradam 2,5/s; regeneração limitada a 100.
- **RN-DB-04** — Quem morre com deathbringer (ou por suicídio) espera `waiting_time_deathbringer (4 s)` extra para renascer.
- **RN-DB-05** — Sob efeito: não acelera, não pega power-up, não pega/captura/larga/devolve bandeira.

### 6.7 Bandeiras e captura (RN-FLG)
- **RN-FLG-01** — Tipos: bandeira vermelha (0), azul (1), selvagem/verde (2). Pode haver várias de cada. Estados: na base, carregada, largada.
- **RN-FLG-02** — Pegar: tocar (raio 15 + 15) na bandeira inimiga ou selvagem não carregada. Um jogador carrega no máximo uma. `lock_team_flags`/`lock_wild_flags` impedem pegar. Quem acabou de largar precisa sair do raio antes de pegar de novo. Pegar revela shadow.
- **RN-FLG-03** — Devolver: tocar na própria bandeira largada fora da base a devolve, após `flag_return_delay (0 s)` desde a queda. Bandeiras selvagens não são devolvidas, e com `carry_own_team_flag` não há devolução por toque.
- **RN-FLG-04** — Largar: morrer, suicidar ou tecla de largar (Page Down). Largar voluntariamente desfaz o ponto de pegar (−1 frag).
- **RN-FLG-05** — Captura (padrão `capture_on_team_flag 1`): portador da bandeira inimiga toca **a própria bandeira na base**. Não captura se a própria bandeira foi roubada. Tabela completa das 13 combinações (inimiga/própria/selvagem × base) em `world.cpp:3335-3350`; implementar exatamente.
- **RN-FLG-06** — `min_capture_time (0 s)`: tempo mínimo entre pegar e capturar.
- **RN-FLG-07** — Assistência: aliado que carregava a bandeira-alvo, ou o portador anterior da bandeira capturada, ou o portador anterior da bandeira-alvo.
- **RN-FLG-08** — `carrying_score_time (0 = off)`: em mapas só com bandeiras selvagens, o time ganha 1 ponto a cada N segundos de posse.
- **RN-FLG-09** — `random_wild_flag`, `capture_on_wild_flag`, `carry_own_team_flag`, `capture_away_from_base`, `always_send_flag_location`: variantes de modo; todas devem existir nos presets.
- **RN-FLG-10** — `respawn_on_capture`: após captura, todos os mortos renascem no frame seguinte.

### 6.8 Pontuação de jogador (frags) (RN-PTS)
| Evento | Frags | Fonte |
|---|---:|---|
| Matar inimigo | +1 | `world.cpp:2274` |
| Matar aliado | −2 | idem |
| Matar inimigo na sala onde um aliado carrega bandeira (defesa do portador) | +1 | idem |
| Matar inimigo na sala com a própria bandeira no chão ou na base (defesa) | +1 | idem |
| Matar inimigo na sala com a bandeira inimiga no chão ou na base (ataque) | +1 | idem |
| Matar portador de bandeira inimigo | +1 extra | idem |
| Matar portador aliado | −1 extra | idem |
| Pegar bandeira | +1 | `world.cpp:3639` |
| Largar voluntariamente | −1 | `world.cpp:1758` |
| Devolver própria bandeira | +1 | `world.cpp:3306` |
| Capturar | +3 (capturador) | `world.cpp:3650` |
| Assistência | +3 | idem |
| Captura do próprio time | +2 para cada membro | idem |
| Suicídio | −1 | `world.cpp:2392` |
| Ponto por posse da selvagem (RN-FLG-08) | +2 para cada membro | `world.cpp:3684` |

- **RN-PTS-01** — Os três bônus de sala (portador, defesa, ataque) valem no máximo +1 no total, nessa prioridade; os dois de bandeira não valem com `lock_team_flags` em efeito. "Portador" é quem carrega qualquer bandeira.

- **RN-PTS-02** — **Pontos negativos** (usados no ranking): morrer +1 neg (inclusive suicídio); morrer com bandeira +1 neg extra; bandeira do seu time capturada +1 neg para cada membro (exceto captura de bandeira selvagem); ponto de posse da selvagem do adversário +1 neg para cada membro.
- **RN-PTS-03** — Placar do time = nº de capturas (+ pontos de posse, RN-FLG-08).

### 6.9 Partida e condições de fim (RN-PAR)
- **RN-PAR-01** — Vitória por captura: time atinge `capture_limit (8)` **e** está à frente por `win_score_difference (1)`.
- **RN-PAR-02** — Limite de tempo `time_limit (0 = sem limite)` minutos. Avisos aos 5 min (se limite ≥ 10 min), 1 min (≥ 2 min) e 30 s (≥ 1 min). Só conta com 2+ jogadores.
- **RN-PAR-03** — Empate no fim do tempo: se `extra_time > 0`, prorrogação (pode ter vários períodos); se `sudden_death`, a próxima captura vence; senão termina empatado.
- **RN-PAR-04** — Fim de partida: placa de game over por `game_end_delay (5 s)`, estatísticas enviadas a todos, troca de mapa (RN-VOT).
- **RN-PAR-05** — Início do mapa: jogadores nascem nos spawn points do time (round-robin, a partir do segundo ponto); sem spawn points, como no respawn (RN-SPW-03).

### 6.10 Spawn e respawn (RN-SPW)
- **RN-SPW-01** — Tempo de respawn: `respawn_time (2 s)` + tempo extra = `extra_respawn_time_alone (0)` + `respawn_balancing_time × (meu time − time inimigo) / time inimigo` quando meu time é maior. O tempo extra é descontado de quem espera junto com alguém do outro time (RN-SPW-02), por isso só pesa para quem morre "sozinho". (`world.cpp:1627`)
- **RN-SPW-02** — Respawn ocorre em ordem justa entre os times (fila ordenada por tempo extra; `world.cpp:3516-3545`).
- **RN-SPW-03** — Local: áreas `V respawn` do time, se houver; senão sala aleatória **desocupada**, longe de paredes.
- **RN-SPW-04** — `spawn_safe_time (0 s)`: invulnerável e sem atirar após nascer.
- **RN-SPW-05** — Ao nascer: vida/energia iniciais, arma `pup_start_weapon`, power-ups iniciais.

### 6.11 Times (RN-TIM)
- **RN-TIM-01** — Ao entrar: vai para o time com menos jogadores; empate → time onde só há humanos+bots e o outro não tem humanos; senão o time com menos humanos; empate total → time com menor força (modificador de ranking, RN-RNK-03). **v2 (D-65):** a força passa a ser a soma dos μ do OpenSkill (RN-SKL-05).
- **RN-TIM-02** — Troca de time (Ctrl+End): se o outro time tem 2+ a menos, move; se há alguém querendo trocar no outro time, troca os dois; se o outro tem 1 a menos, move; senão troca com um bot (prioridade: morto, sem bandeira, qualquer). (`server.cpp:255-390`)
- **RN-TIM-03** — `balance_teams`: `no` / `balance` (move aleatórios até diferença ≤ 1) / `shuffle` (embaralha a cada mapa).
- **RN-TIM-04** — Máx. jogadores: par entre 2 e 32; cada time = metade.
- **RN-TIM-05** — Cores: time vermelho/azul + cor pessoal escolhida das cores favoritas do jogador, sem repetir no time.

### 6.12 Mapas: rotação e votação (RN-VOT)
- **RN-VOT-01** — Cada jogador vota em um mapa da lista (F2) e pode votar para sair do mapa atual (F8).
- **RN-VOT-02** — Troca de mapa quando votos "sair" de humanos > contra (bots não votam), respeitando `vote_block_time`; com `require_specific_map_vote`, só conta quem votou num mapa específico.
- **RN-VOT-03** — Próximo mapa: o mais votado; empate → o jogado há mais tempo; se ainda empatado, sorteio (excluindo o atual). Sem votos: próximo da lista, pulando mapas com votos negativos.
- **RN-VOT-04** — `random_maprot`: 0 = em ordem, 1 = aleatória, 2 = primeiro mapa aleatório.
- **RN-VOT-05** — Admin pode forçar troca (`/forcemap`) ou reinício.

### 6.13 Chat e moderação (RN-CHT)
- **RN-CHT-01** — Mensagem até 200 caracteres. Iniciada com `.` → só para o time. Iniciada com `/` → comando.
- **RN-CHT-02** — Anti-flood só para rajadas extremas (D-60): cada mensagem soma 1 e esfria 0,1/frame, sempre (lobby, pausa e troca de mapa incluídos); mais de 30 seguidas → bloqueio ("too much talk") até esfriar ~11 s; tentar durante o bloqueio não o prolonga. Caractere repetido não é mais descartado. (Original: bloqueio na 3ª mensagem seguida e descarte de 7 caracteres iguais, `server.cpp`, `commont.cpp:202`.)
- **RN-CHT-03** — Comandos de jogador: `/help`, `/info`, `/time`, `/sayadmin`. Admin: `/list`, `/kick`, `/ban ID min` (até 1 semana), `/mute`, `/smute` (silencioso: só o próprio vê), `/unmute`, `/forcemap`, `/set` (alterar settings permitidos).
- **RN-CHT-04** — Ações de admin são registradas em log (auditoria).

### 6.14 Inatividade (RN-IDL)
- **RN-IDL-01** — `idlekick_time (120 s)`: jogador sem input é avisado e depois desconectado, somente se há ≥ `idlekick_playerlimit (4)` humanos.

### 6.15 Nomes e identidade (RN-NOM)
- **RN-NOM-01** — Nome: até 15 caracteres, imprimíveis, não pode ser vazio/só espaços nem começar/terminar com espaço. (`commont.cpp:190`)
- **RN-NOM-02** — Web: o **nome de usuário é o nick em jogo**: único (comparação `makeComparable` do original com acentos dobrados, `src/auth.cpp:88`) e protegido; convidados recebem o sufixo `*` e não podem usar nick registrado nem reservado (troca de nome a cada 30 dias, nome antigo reservado por 90). Ver D-20 e `plan/specs/names.md`.
- **RN-NOM-03** — Clan tag opcional exibida como `(TAG) nome` no chat. **v2:** a tag é a do clã cadastrado do jogador (RN-CLA-05, D-47), não mais um texto livre. O clã escolhe o estilo da tag: `(TAG) nome`, `[TAG] nome`, `TAG-nome`, `TAG.nome` ou `TAG|nome` (OG-338).

### 6.16 Ranking (RN-RNK)
> **Descontinuado na v2 (D-66, 2026-10-22):** o ranking por score/neg dá lugar ao rating do OpenSkill (RN-SKL) e ao leaderboard mensal (RN-LDB). As regras abaixo ficam como histórico.

Comportamento original (`server.cpp:450-515`, `servnet.cpp:924`):
- **RN-RNK-01** — A partida conta para o ranking só se: sala **Ranked** (RN-MOD-02, sem power-ups), ≥ `ranking_minhumans (2)` humanos distintos e ≥ `ranking_minplayers (4)` jogadores (só humanos: não há bots no Ranked, D-11). O jogador precisa estar logado e com participação ativa.
- **RN-RNK-02** — Cada frag positivo soma ao **score** multiplicado pelo modificador do time; cada ponto negativo soma ao **neg** sem modificador.
- **RN-RNK-03** — Força do jogador = `(score+1)/(neg+1)` (ou 1,0 se score < 100). Força do time = soma (ou média se `respawn_balancing_time ≥ 5`). Modificador do time = `força_inimiga / força_própria` limitado a **[1/3, 3]** — o time mais fraco ganha mais.
- **RN-RNK-04** — Deltas enviados ao fim de cada partida e na saída do jogador (também na troca de mapa por voto, no reinício com o 2º jogador e na parada do servidor). Só deltas inteiros ≠ 0; ao enviar, a fração restante se perde, como no original (`servnet.cpp:924-960`, spec `plan/specs/ranking.md`).
- **Web (novo):** ranking por **temporadas**; leaderboard ordenado por `rating = (score+1)/(neg+1)` com mínimo de 100 pontos positivos para aparecer, desempate por score (ver Decisão D-02). Histórico e estatísticas agregadas por jogador.

### 6.17 Estatísticas (RN-STA)
- **RN-STA-01** — Por jogador: frags, kills, deaths, maior sequência de kills/mortes, suicídios, capturas, assistências, bandeiras pegas/largadas/devolvidas, portadores mortos, tiros, acertos, precisão, tiros recebidos, tempo de vida (médio), tempo de jogo, distância percorrida, velocidade média, tempo carregando bandeira. (`world.h:266`)
- **RN-STA-02** — Por time: as mesmas agregações + lista de capturas com tempo e nome (capturador + assistente).
- **RN-STA-03** — Ao fim de cada partida, as estatísticas são persistidas (equivalente a `save_stats`) e exibidas em F3 (time) / F4 (jogador).

### 6.18 Bots (RN-BOT)
- **RN-BOT-01** — `min_bots`: mínimo de bots; `bots_fill`: completa até N jogadores; `balance_bot`: adiciona bot para equilibrar times. Um humano entrando com sala cheia substitui um bot.
- **RN-BOT-02** — Bots simulam ping `bot_ping (300 ms)` e jogam com a mesma interface de controles de um cliente (sem acesso a informação extra).
- **RN-BOT-03** — Nomes de bots: listas `classic` ou `fi` (`names.cpp`), marcados como bot na UI. Bots não contam para ranking como humanos e não votam.

### 6.19 Visibilidade e minimapa (RN-VIS)
- **RN-VIS-01** — Na tela: apenas a sala atual (configurável no cliente para ver salas vizinhas, como `visible_rooms`).
- **RN-VIS-02** — Minimapa mostra aliados e inimigos vistos por aliados; com shadow, mostra todos os inimigos sem shadow. Limite `minimap_send_limit (32)` por frame.
- **RN-VIS-03** — Bandeiras: posição conhecida conforme visibilidade; `always_send_flag_location` envia sempre.

### 6.20 Configuração de sala (RN-CFG)
- **RN-CFG-01** — Toda sala é criada a partir de um **preset**, que pertence a um modo. **Casual:** **Clássico** = `config/gamemod.txt` distribuído (padrão); sugeridos Duelo, Insta (dano alto), Caos (power-ups em dobro). **Ranked:** um único preset, **Ranked** = Clássico sem power-ups (RN-MOD-02), travado.
- **RN-CFG-02** — Cada setting tem tipo, faixa válida e default conforme `server_settings.cpp`; valores fora da faixa são rejeitados.
- **RN-CFG-03** — Salas privadas (só Casual): senha (máx. 15 caracteres no original), dono pode alterar settings permitidos. Salas Ranked usam somente o preset Ranked travado (RN-MOD-04); na v2 podem ter senha, sem alterar settings (D-44, RN-RKL-06).

### 6.21 Plataforma web (RN-PLT) — novas
- **RN-PLT-01** — **Login simples**: cadastro com **nome de usuário** (regras RN-NOM-01, único), **senha** (mín. 8 caracteres, guardada com argon2id) e **e-mail** (obrigatório, único, usado **apenas** para recuperação de senha). Login com usuário + senha. Sem login social (OAuth fora do v1) e sem confirmação obrigatória de e-mail: o cadastro libera o jogo na hora.
- **RN-PLT-02** — Convidado joga só no modo **Casual**, sem cadastro (RN-MOD-01/03).
- **RN-PLT-03** — Recuperação de senha: o jogador informa usuário ou e-mail; um link de uso único (expira em 30 min) é enviado ao e-mail cadastrado; a resposta da tela é sempre a mesma, exista ou não a conta (não revela cadastros). Trocar a senha encerra as outras sessões.
- **RN-PLT-06** — Proteção do login: limite de tentativas por usuário e por IP (ex. 5 falhas → espera crescente); mensagens de erro genéricas ("usuário ou senha inválidos").
- **RN-PLT-04** — Exclusão de conta (LGPD): remove dados pessoais; partidas históricas ficam anonimizadas.
- **RN-PLT-05** — Bans de plataforma (conta + IP/dispositivo) gerenciados no painel admin; bans de sala expiram (máx. 1 semana, como no original).

---

## 7. Requisitos não funcionais
| Categoria | Requisito |
|---|---|
| Desempenho servidor | Tick de 10 Hz; p95 do tempo de simulação + serialização < 5 ms com 32 jogadores; ≥ 20 salas cheias por vCPU |
| Desempenho cliente | 60 fps em notebook médio com 32 jogadores; bundle inicial < 5 MB (assets sob demanda) |
| Rede | Jogável até 150 ms de RTT; tolerante a 2% de perda; tráfego < 10 KB/s por cliente |
| Disponibilidade | 99,5% mensal para API e lobby |
| Segurança | Servidor autoritativo; validação e rate limit de todas as mensagens; OWASP ASVS nível 1 na API |
| Privacidade | LGPD: consentimento, exportação e exclusão de dados |
| Compatibilidade | Últimas 2 versões de Chrome, Firefox, Safari, Edge (desktop). Mobile: fora do v1 (input por toque é card futuro) |
| i18n | en, pt-BR, fi, it |
| Acessibilidade | Menus navegáveis por teclado; remapeamento total de teclas; opção de alto contraste |
| Licença | GPL-2.0-or-later; link para o código-fonte no rodapé do jogo |

---

## 8. Metodologia ágil

### 8.1 Modelo
**Scrum com quadro Kanban** ("Scrumban"):
- **Sprints de 2 semanas.** Planning na segunda-feira, review + retro na sexta da semana 2.
- **Papéis:** PO (prioriza, aceita cards), Tech Lead (arquitetura, revisão), Devs, **Agentes IA** (executam cards seguindo as skills; nunca movem card para Done).
- **Limite de WIP:** máx. 2 cards "Em andamento" por pessoa/agente.

### 8.2 Fluxo de status
```
Backlog → Pronto (Ready) → Em andamento → Em revisão → Concluído
                               │
                               └→ Bloqueado (com motivo e card/decisão que bloqueia)
```
A mudança de status é feita **no cabeçalho do card e na tabela da seção 10** no mesmo commit.

### 8.3 Definition of Ready (DoR)
- [ ] História e critérios de aceite claros e testáveis.
- [ ] Dependências em "Concluído" (ou explicitamente paralelizáveis).
- [ ] Referências ao código original identificadas (v1, cards de port).
- [ ] Decisões de produto de que o card depende tomadas pelo PO (v2).
- [ ] Estimativa feita.

### 8.4 Definition of Done (DoD)
- [ ] Critérios de aceite atendidos e demonstrados.
- [ ] Spec em `plan/specs/` criada/atualizada (v1, cards de port).
- [ ] Testes unitários; **testes de paridade** para cards da simulação (v1; na v2, testes da regra nova — ver OG-230).
- [ ] Cards de interface (v2): sem prints obrigatórios desde a S14 (só a pedido do PO).
- [ ] Lint, typecheck e CI verdes (v2: verificados no fechamento da sprint).
- [ ] Sem divergência silenciosa: divergências intencionais registradas na seção 12.
- [ ] Documentação do card ("Notas de implementação") atualizada.
- [ ] Revisado por outra pessoa e aceito pelo PO.

### 8.5 Estimativa
Story points em Fibonacci (1, 2, 3, 5, 8, 13). Cards de 13 devem ser quebrados antes de entrar em sprint. Velocidade inicial assumida: **~30 pts/sprint** para 2 devs + agentes; recalibrar após o Sprint 2.

### 8.6 Convenções
- **IDs:** `OG-NNN`. Épicos `E0`–`E7`. Regras de negócio `RN-<GRUPO>-NN`. Decisões `D-NN`.
- **Branch:** `og-021-movimento-jogador`. **Commit:** `OG-021: implementa atrito e arrasto`.
- **PR:** linka o card, lista RNs cobertas e anexa o resultado da paridade quando aplicável.
- **Prioridade (MoSCoW):** Must / Should / Could / Won't (v1).

### 8.7 Template de card
```markdown
# OG-XXX — Título

| Campo | Valor |
|---|---|
| Épico | Ex |
| Tipo | Feature / Port / Infra / Spike / Conteúdo |
| Prioridade | Must / Should / Could |
| Estimativa | N pts |
| Sprint | Sx |
| Status | Backlog |
| Dependências | OG-YYY |
| Regras de negócio | RN-... |
| Skills | outgun-re-spec, ... |

## História
Como <persona>, quero <ação>, para <benefício>.

## Contexto e referências no original
## Escopo
## Critérios de aceite
## Notas técnicas
## Notas de implementação
(preenchido durante a execução)
```

### 8.8 Cerimônias e artefatos
| Cerimônia | Entrada | Saída |
|---|---|---|
| Planning | Seção 10, velocidade | Cards do sprint em "Pronto" |
| Daily (assíncrona) | Quadro | Bloqueios registrados nos cards |
| Review | Cards em revisão | Demo; cards aceitos → Concluído |
| Retro | — | Ações registradas em `plan/retros/Sx.md` |
| Refinamento (semanal) | Backlog | Cards quebrados, estimados, com DoR |

---

## 9. Épicos e roadmap

### 9.1 Épicos
| Épico | Nome | Objetivo |
|---|---|---|
| E0 | Fundação e engenharia reversa | Monorepo, original compilando em Docker, harness de paridade, licença |
| E1 | Conteúdo e assets | Mapas, gerador, gráficos, sons, fontes, idiomas |
| E2 | Simulação (`packages/sim`) | Port fiel de `world.cpp` com paridade comprovada |
| E3 | Servidor de jogo | Salas, loop 10 Hz, protocolo, times, votação, chat, bots |
| E4 | Cliente web | Render, input, predição, HUD, menus, áudio |
| E5 | Plataforma | Contas, nick, ranking, perfil, lobby, admin |
| E6 | Replays e espectador | Gravação, player de replay, espectador ao vivo |
| E7 | Qualidade, operação e lançamento | Paridade no CI, E2E, carga, observabilidade, deploy, segurança, beta |
| E8 | **v2** — Visual e menus | Design system com fonte única, menu principal e telas modernas e legíveis |
| E9 | **v2** — Perfil social e relatórios | Perfis, companheiros, marcos e relatórios de partida no cliente atual (site público fica para um repositório próprio no futuro) |
| E10 | **v2** — Trilha sonora | Música no menu e nas partidas, com opção para desligar |
| E11 | **v2** — Jogabilidade | Mudanças de física e regras a partir dos achados do beta |
| E12 | **v2** — Ranked competitivo | Lobby com salas abertas, formatos 3x3/4x4/5x5, séries md1/md3/md5, voto de mapa, prontos, clã x clã, pausas e substituição por bot em quedas |
| E13 | **v2** — Clãs | Clãs criados e geridos pela comunidade: cadastro, convites e pedidos, estatísticas, ranking de clãs e moderação |
| E14 | **v2** — Segurança da operação | Servidor, backups, banco, containers, GitHub, contas dos provedores e monitoramento, guiados pelo OWASP Cheat Sheet Series |

### 9.2 Roadmap por sprint
| Sprint | Tema | Cards | Marco |
|---|---|---|---|
| S0 | Fundação | OG-001, OG-002, OG-005 | |
| S1 | Engenharia reversa + conteúdo | OG-003, OG-004, OG-010, OG-012 | |
| S2 | Simulação I | OG-020, OG-021, OG-030, OG-100, OG-013 | |
| S3 | Simulação II | OG-022, OG-023, OG-024, OG-014 | |
| S4 | Simulação III | OG-025, OG-026, OG-027 | |
| S5 | Simulação IV + servidor | OG-028, OG-029, OG-040, OG-041 | **M1 — Simulação com paridade** |
| S6 | Cliente jogável | OG-060, OG-061, OG-062, OG-063, OG-042, OG-043 | |
| S7 | Multiplayer completo | OG-064, OG-065, OG-044, OG-045, OG-067 | **M2 — Alpha interno jogável** |
| S8 | Contas | OG-080, OG-081, OG-082, OG-083, OG-046, OG-047 | |
| S9 | Ranking e social | OG-049, OG-084, OG-085, OG-086, OG-066, OG-068, OG-069 | **M3 — Contas e ranking** |
| S10 | Bots, gerador e replays | OG-050, OG-051, OG-052, OG-053, OG-054, OG-011, OG-090, OG-091, OG-092 | **M4 — Paridade de funcionalidades** |
| S11 | Endurecimento | OG-101, OG-102, OG-103, OG-104, OG-087 | |
| S12 | Beta e lançamento | OG-109, OG-106, OG-108, OG-107, OG-105 | **M5 — Lançamento público** |
| S13 | v2: base visual e trilha | OG-200, OG-201, OG-202, OG-220, OG-221, OG-222 | |
| S14 | v2: telas, dados sociais e relatório | OG-203, OG-205, OG-211, OG-214 | |
| S15 | v2: perfil social | OG-212, OG-213, OG-215 | **M6 — v2 visual e social** |
| S16 | v2: clãs e temporadas mensais | OG-270, OG-271, OG-272, OG-275, OG-267 | |
| S17 | v2: lobby Ranked (servidor e API) | OG-250, OG-251, OG-252, OG-253, OG-254 | |
| S18 | v2: lobby Ranked (cliente), séries, clã no HUD e tela inicial | OG-207, OG-265, OG-206, OG-255, OG-256, OG-257, OG-208, OG-209 | |
| S19 | v2: rating por formato, clã x clã, ranking de clãs e hall da fama | OG-258, OG-259, OG-273, OG-274, OG-268 | |
| S20 | v2: pausas, quedas e bots substitutos | OG-260, OG-261, OG-262, OG-266, OG-263, OG-264 | **M7 — Ranked competitivo e clãs** |
| S21 | v2: correções dos achados (depois do fim dos épicos E12/E13) | OG-277, OG-278, OG-279, OG-281, OG-231, OG-232, OG-282, OG-283, OG-285 | |
| S22 | v2: correções dos power-ups, bots do Casual e pequenas melhorias | OG-286, OG-287, OG-288 (primeiro), OG-289, OG-290, OG-280 | |
| S23 | v2: menus com a cara do jogo (tema Campo) | OG-291 | |
| S24 | v2: segundo tema de menu (Placar) | OG-292 | |
| S25 | v2: HUD da partida por resolução (escala, faixa, coluna, placar de borda a borda) | OG-293, OG-294, OG-295, OG-296 | |
| S26 | v2: estilos do HUD (Clássico, Moderno e Personalizado) | OG-297, OG-298, OG-299, OG-300, OG-302 | |
| S27 | v2: ajustes do HUD Moderno | OG-303 | |
| S28 | v2: domínio próprio e prévia de compartilhamento | OG-304, OG-305 | |
| S29 | v2: segurança da operação (servidor, banco, GitHub, borda) — OWASP Cheat Sheets | OG-306, OG-308, OG-309, OG-311, OG-315, OG-316, OG-317 | |
| S30 | v2: espectador para o competitivo e nome que some com o ciano | OG-318, OG-319, OG-320, OG-321 | |
| S31 | v2: faixas novas, rotação da trilha no menu e tocador na tela inicial | OG-322 | |
| S32 | v2: Outgun no computador (app instalável e `.exe`) | OG-323, OG-324, OG-325, OG-326 | |
| S33 | v2: Outgun na Steam | OG-328 | |
| S34 | v2: rodada de correções do Ranked da comunidade | OG-329, OG-330, OG-331 | |
| S35 | v2: segunda rodada de correções do Ranked da comunidade | OG-332, OG-333, OG-334, OG-335, OG-336, OG-337, OG-338, OG-339, OG-340 | |
| S36 | v2: melhorias do Ranked e do fim de partida | OG-341, OG-342, OG-343, OG-344, OG-345, OG-346, OG-347, OG-348 | |
| S37 | v2: rating de habilidade com OpenSkill e leaderboard mensal no lugar do ranking por score/neg; link da Steam, menu inicial enxuto e notificações | OG-349, OG-350, OG-351, OG-352, OG-353, OG-354, OG-358, OG-359, OG-360, OG-361 | |
| S38 | v2: stats novos do leaderboard (dano efetivo, zonas, defesas) e registro de eventos (multi-kill, troca, primeiro abate, quem matou quem); presets e rotação do painel na criação de sala e mapas .txt enviados pela moderação | OG-355, OG-362, OG-363, OG-364, OG-365, OG-366, OG-367, OG-368 | |
| S39 | v2: jogabilidade e resposta aos comandos — latência do input medida, toda tecla chega ao servidor a tempo (envio por evento), diagonal e Alt sem virar a arma, FPS sem limite no desktop/Steam (VSync desligado por padrão) | OG-369, OG-370, OG-371, OG-372, OG-373; 2.39.1: OG-379, OG-381 | |
| S40 | v2: tela de moderação simples para qualquer moderador (mapas do painel em "Criar sala", rotações a partir da atual e por modo, presets em formulário) primeiro; enxugar o legado (sem finlandês e italiano, revisão das opções); depois relatório no visual novo, estudo do servidor acima de 10 Hz (D-74) e quadro de baixa latência | OG-377, OG-378, OG-383, OG-382, OG-384, OG-385, OG-386, OG-388, OG-389, OG-380, OG-375, OG-374 | |
| S41 | v2: marcos — ~50 novos a partir dos stats e eventos (vitórias, tempo, bandeira, defesa, combate, armas, ranked por formato, mapas, dupla), 14 secretos raros (dois do 7x1 e a virada histórica), marcos de humor, perfil no jogo por grupo com progresso e raridade, ícones e conquistas da Steam espelhando os marcos | OG-390, OG-391, OG-398, OG-399, OG-392, OG-395, OG-393, OG-394, OG-396, OG-397; 2.41.1: OG-400, OG-401; 2.41.2: OG-402 | |
| S42 | v2: salas com cara de jogo real — nomes e prefixo dos bots no painel e bots que falam no chat conforme a partida; filtro de nomes nos jogadores; portal ao vivo; logs de segurança e alertas; estudo do WebTransport | OG-276, OG-403, OG-404, OG-313, OG-284, OG-376 | |
| S43 | v2: personalização — cores do clã (o lado vira o clã: "CLÃ x AZUL"), números de jogador como na F1 (o 1 para o líder do mês) e 32 cores pessoais com dourado, prateado e bronze para o top 3 | OG-412, OG-411, OG-407, OG-408, OG-409, OG-410, OG-413; 2.43.1: OG-415 | |
| S44 | v2: melhorias de UX da comunidade (PR #5) — nova tela inicial com escolha de time, menus em estilo retrô, trilha na barra de cima | OG-416 | |
| S45 | v2: o celular volta, sem a partida — portão por rota, barra e base responsiva, tela inicial do portal, conta, perfil, clã, ranking, relatório da partida e da série, PDF do relatório completo (partida e série) e moderação, no visual retrô da S44 | OG-417, OG-418, OG-420, OG-419, OG-421, OG-422, OG-423, OG-424, OG-425, OG-426, OG-427 | |
| S46 | v2: relatos de bug da comunidade — tela que congelava depois da explosão do Deathbringer (issue #6), formulário de bug no site, issue no GitHub pelo painel, retorno ao jogador e issues que viram cards | OG-428, OG-429, OG-430, OG-431, OG-432 | |
| S47 | v2: rodada de correções (issues do GitHub) | OG-442, OG-443, OG-444, OG-445, OG-446 | |
| S48 | v2: observabilidade no plano gratuito — métricas e logs do beta no Grafana Cloud (Alloy), banco, quedas no game server, painéis e alertas, alarmes da Oracle | OG-452, OG-453, OG-454, OG-455, OG-456 | |
| S49 | v2: coletor leve (Fluent Bit) para mandar as métricas e logs do beta ao Grafana Cloud na E2.1.Micro | OG-457 | |
| S50 | v2: rodada de correções (issues #11 e #14–#24; #12 e #13 já corrigidas na 2.49.2) | OG-458, OG-460, OG-461, OG-462, OG-463 (OG-459 cancelado, D-83), OG-464, OG-465, OG-466, OG-467, OG-468 | |

> Duração total estimada: **13 sprints (~26 semanas)**. Replanejar após S2 com a velocidade real.

---

## 10. Backlog — índice de cards

| ID | Título | Épico | Pts | Prio | Sprint | Depende de | Status |
|---|---|---|---:|---|---|---|---|
| [OG-001](cards/OG-001-monorepo-setup.md) | Setup do monorepo TypeScript e CI | E0 | 3 | Must | S0 | — | Concluído |
| [OG-002](cards/OG-002-build-original-docker.md) | Build do Outgun original em Docker (oráculo) | E0 | 5 | Must | S0 | — | Concluído |
| [OG-003](cards/OG-003-parity-harness.md) | Harness de golden traces (paridade) | E0 | 8 | Must | S1 | OG-002 | Concluído |
| [OG-004](cards/OG-004-constants-and-units.md) | Constantes, unidades e RNG glibc em TS | E0 | 3 | Must | S1 | OG-001 | Concluído |
| [OG-005](cards/OG-005-license-credits.md) | Licença GPL, créditos e conformidade | E0 | 2 | Must | S0 | — | Concluído |
| [OG-010](cards/OG-010-map-parser.md) | Parser de mapas e validação de todos os mapas | E1 | 5 | Must | S1 | OG-001 | Concluído |
| [OG-011](cards/OG-011-map-generator.md) | Gerador de mapas aleatórios | E1 | 5 | Should | S10 | OG-010 | Concluído |
| [OG-012](cards/OG-012-graphics-sound-pipeline.md) | Pipeline de gráficos e sons | E1 | 5 | Must | S1 | OG-001 | Concluído |
| [OG-013](cards/OG-013-font-conversion.md) | Conversão das fontes Allegro | E1 | 3 | Should | S2 | OG-002 | Concluído |
| [OG-014](cards/OG-014-i18n.md) | Internacionalização (en, pt-BR, fi, it) | E1 | 3 | Should | S3 | OG-001 | Concluído |
| [OG-015](cards/OG-015-random-maps-rotation.md) | Mapas aleatórios na rotação da sala (envio do mapa gerado) | E1 | 3 | Should | — | OG-011 | Concluído |
| [OG-020](cards/OG-020-geometry-walls.md) | Geometria e paredes (colisão contínua) | E2 | 8 | Must | S2 | OG-004, OG-010 | Concluído |
| [OG-021](cards/OG-021-player-movement.md) | Movimento do jogador e troca de sala | E2 | 5 | Must | S2 | OG-020 | Concluído |
| [OG-022](cards/OG-022-rockets.md) | Foguetes: formações, voo e impacto | E2 | 5 | Must | S3 | OG-021 | Concluído |
| [OG-023](cards/OG-023-player-collisions.md) | Colisões entre jogadores (none/normal/special) | E2 | 5 | Must | S3 | OG-021 | Concluído |
| [OG-024](cards/OG-024-health-energy-damage.md) | Vida, energia, dano e shield | E2 | 3 | Must | S3 | OG-022 | Concluído |
| [OG-025](cards/OG-025-powerups.md) | Power-ups | E2 | 8 | Must | S4 | OG-024 | Concluído |
| [OG-026](cards/OG-026-deathbringer.md) | Deathbringer | E2 | 5 | Must | S4 | OG-025 | Concluído |
| [OG-027](cards/OG-027-flags-capture.md) | Bandeiras e captura | E2 | 8 | Must | S4 | OG-024 | Concluído |
| [OG-028](cards/OG-028-scoring-stats.md) | Pontuação e estatísticas | E2 | 3 | Must | S5 | OG-027 | Concluído |
| [OG-029](cards/OG-029-match-lifecycle.md) | Ciclo da partida, spawn e respawn | E2 | 5 | Must | S5 | OG-027 | Concluído |
| [OG-030](cards/OG-030-settings-presets.md) | Settings tipados e presets de sala | E2 | 3 | Must | S2 | OG-004 | Concluído |
| [OG-040](cards/OG-040-game-server-core.md) | Núcleo do game server (salas, loop 10 Hz) | E3 | 5 | Must | S5 | OG-029 | Concluído |
| [OG-041](cards/OG-041-binary-protocol.md) | Protocolo binário v1 | E3 | 5 | Must | S5 | OG-001 | Concluído |
| [OG-042](cards/OG-042-snapshots-aoi.md) | Snapshots por cliente e interesse por sala | E3 | 5 | Must | S6 | OG-040, OG-041 | Concluído |
| [OG-043](cards/OG-043-client-input.md) | Entrada do cliente e validação | E3 | 3 | Must | S6 | OG-041 | Concluído |
| [OG-044](cards/OG-044-teams.md) | Times: entrada, troca e balanceamento | E3 | 3 | Must | S7 | OG-040 | Concluído |
| [OG-045](cards/OG-045-map-rotation-vote.md) | Rotação e votação de mapas | E3 | 3 | Must | S7 | OG-040 | Concluído |
| [OG-046](cards/OG-046-chat-moderation.md) | Chat, comandos e moderação | E3 | 5 | Must | S8 | OG-040 | Concluído |
| [OG-047](cards/OG-047-idle-reconnect.md) | Idle kick, desconexão e reconexão | E3 | 3 | Should | S8 | OG-040 | Concluído |
| [OG-048](cards/OG-048-bots.md) | Bots (quebrado em OG-050 a OG-054) | E3 | ~~13~~ | Should | S10 | OG-042 | Quebrado |
| [OG-050](cards/OG-050-bot-areamap.md) | Bots: AreaMap e tabelas de distância | E3 | 3 | Should | S10 | OG-042 | Concluído |
| [OG-051](cards/OG-051-bot-navigation.md) | Bots: navegação até destinos | E3 | 3 | Should | S10 | OG-050 | Concluído |
| [OG-052](cards/OG-052-bot-combat.md) | Bots: mira, tiro e esquiva | E3 | 3 | Should | S10 | OG-042 | Concluído |
| [OG-053](cards/OG-053-bot-brain.md) | Bots: decisões de bandeira e power-up e laço principal | E3 | 3 | Should | S10 | OG-051, OG-052 | Concluído |
| [OG-054](cards/OG-054-bot-population.md) | Bots: população automática e nomes | E3 | 2 | Should | S10 | OG-042 | Concluído |
| [OG-049](cards/OG-049-game-modes.md) | Modos de jogo: Casual e Ranked | E3 | 3 | Must | S9 | OG-030, OG-083, OG-086 | Concluído |
| [OG-060](cards/OG-060-web-shell.md) | Shell React e menus | E4 | 5 | Must | S6 | OG-001 | Concluído |
| [OG-061](cards/OG-061-renderer-world.md) | Renderer PixiJS: salas e paredes | E4 | 5 | Must | S6 | OG-010, OG-012 | Concluído |
| [OG-062](cards/OG-062-renderer-entities.md) | Renderer: entidades e efeitos | E4 | 8 | Must | S6 | OG-061 | Concluído |
| [OG-063](cards/OG-063-input.md) | Input: teclado, remapeamento e gamepad | E4 | 3 | Must | S6 | OG-060 | Concluído |
| [OG-064](cards/OG-064-prediction-interpolation.md) | Predição, reconciliação e interpolação | E4 | 8 | Must | S7 | OG-042, OG-043 | Concluído |
| [OG-065](cards/OG-065-hud.md) | HUD: barras, timers, placar, minimapa, chat | E4 | 5 | Must | S7 | OG-062 | Concluído |
| [OG-066](cards/OG-066-overlays-stats.md) | Telas F1–F5, Tab e lista de mapas | E4 | 5 | Should | S9 | OG-065 | Concluído |
| [OG-067](cards/OG-067-audio.md) | Áudio | E4 | 3 | Must | S7 | OG-012 | Concluído |
| [OG-068](cards/OG-068-player-options.md) | Opções do jogador | E4 | 3 | Should | S9 | OG-060 | Concluído |
| [OG-069](cards/OG-069-lobby.md) | Lobby de salas | E4 | 5 | Must | S9 | OG-086 | Concluído |
| [OG-070](cards/OG-070-advanced-options.md) | Opções gráficas e de jogo avançadas do original | E4 | 5 | Could | — | OG-068 | Concluído |
| [OG-080](cards/OG-080-api-db.md) | API e banco de dados | E5 | 5 | Must | S8 | OG-001 | Concluído |
| [OG-081](cards/OG-081-auth.md) | Cadastro, login e recuperação de senha | E5 | 5 | Must | S8 | OG-080 | Concluído |
| [OG-082](cards/OG-082-nick-protection.md) | Nome de usuário em jogo, troca de nome e clan tag | E5 | 2 | Must | S8 | OG-081 | Concluído |
| [OG-083](cards/OG-083-join-ticket.md) | Ticket de entrada no game server | E5 | 3 | Must | S8 | OG-081, OG-040 | Concluído |
| [OG-084](cards/OG-084-ranking.md) | Ranking e temporadas | E5 | 8 | Must | S9 | OG-083, OG-028 | Concluído |
| [OG-085](cards/OG-085-profile-history.md) | Perfil e histórico de partidas | E5 | 5 | Should | S9 | OG-084 | Concluído |
| [OG-086](cards/OG-086-room-registry.md) | Registro de salas e matchmaking | E5 | 5 | Must | S9 | OG-080, OG-040 | Concluído |
| [OG-087](cards/OG-087-admin-panel.md) | Painel admin | E5 | 5 | Should | S11 | OG-086, OG-046 | Concluído |
| [OG-090](cards/OG-090-replay-recording.md) | Gravação de replays | E6 | 3 | Should | S10 | OG-042 | Concluído |
| [OG-091](cards/OG-091-replay-player.md) | Player de replay | E6 | 5 | Should | S10 | OG-090, OG-065 | Concluído |
| [OG-092](cards/OG-092-spectator.md) | Espectador ao vivo | E6 | 3 | Could | S10 | OG-090 | Concluído |
| [OG-100](cards/OG-100-parity-ci.md) | Paridade automatizada no CI | E7 | 3 | Must | S2 | OG-003 | Concluído |
| [OG-101](cards/OG-101-e2e-load.md) | Testes E2E e de carga | E7 | 5 | Must | S11 | OG-064 | Concluído |
| [OG-102](cards/OG-102-observability.md) | Observabilidade | E7 | 3 | Must | S11 | OG-040, OG-080 | Concluído |
| [OG-103](cards/OG-103-infra-deploy.md) | Infraestrutura e deploy | E7 | 5 | Must | S11 | OG-040, OG-080 | Concluído |
| [OG-104](cards/OG-104-security.md) | Segurança e anti-cheat | E7 | 5 | Must | S11 | OG-043, OG-081 | Concluído |
| [OG-105](cards/OG-105-beta-launch.md) | Beta fechado, balanceamento e lançamento (execução) | E7 | 3 | Must | S12 | OG-106 a OG-109 | Bloqueado |
| [OG-106](cards/OG-106-closed-beta.md) | Beta fechado: convites, feedback e triagem | E7 | 5 | Must | S12 | OG-087, OG-081 | Concluído |
| [OG-107](cards/OG-107-legal-launch-pages.md) | Termos de uso, política de privacidade e página de lançamento | E7 | 2 | Must | S12 | OG-104 | Concluído |
| [OG-108](cards/OG-108-network-telemetry.md) | Telemetria de rede e predição para ajuste | E7 | 3 | Should | S12 | OG-064, OG-102 | Concluído |
| [OG-109](cards/OG-109-single-host-deploy.md) | Deploy em máquina única (VPS de qualquer provedor) | E7 | 5 | Must | S12 | OG-103 | Concluído |
| [OG-200](cards/OG-200-design-system-v2.md) | Design system v2: fonte única, tokens e componentes base | E8 | 5 | Must | S13 | — | Concluído |
| [OG-201](cards/OG-201-menu-principal-v2.md) | Novo menu principal e moldura das telas | E8 | 5 | Must | S13 | OG-200 | Concluído |
| [OG-202](cards/OG-202-opcoes-conta-v2.md) | Opções, controles e conta no novo visual | E8 | 5 | Must | S13 | OG-200 | Concluído |
| [OG-203](cards/OG-203-telas-restantes-v2.md) | Salas, replays, ajuda, créditos, legais e feedback no novo visual | E8 | 5 | Must | S14 | OG-201 | Concluído |
| [OG-204](cards/OG-204-admin-v2.md) | Painel admin e moderação no novo visual | E8 | 3 | Could | — | OG-200 | Backlog |
| [OG-206](cards/OG-206-cla-no-hud.md) | Clã do jogador no HUD da partida, em todos os modos | E8 | 3 | Should | S18 | OG-265, OG-270 | Concluído |
| [OG-205](cards/OG-205-fonte-unica-jogo.md) | Fonte única dentro da partida (HUD, chat, placar e overlays) | E8 | 5 | Won't (v2) | — | OG-200 | Cancelado |
| [OG-207](cards/OG-207-titulo-do-mapa-nas-telas.md) | Título do mapa (e não o nome do arquivo) em todas as telas | E8 | 2 | Must | S18 | — | Concluído |
| [OG-208](cards/OG-208-tela-inicial-viva.md) | Tela inicial viva: quem está jogando e o ranking do mês | E8 | 3 | Should | S18 | OG-267 | Concluído |
| [OG-209](cards/OG-209-aviso-celular.md) | Aviso de que o jogo não está disponível para celular | E8 | 1 | Must | S18 | — | Concluído |
| [OG-210](cards/OG-210-portal-web.md) | Portal web público (fora do cliente do jogo) | E9 | 5 | Won't (v2) | — | OG-200 | Cancelado |
| [OG-211](cards/OG-211-api-social.md) | API social: companheiros, rivais, evolução e busca | E9 | 5 | Must | S14 | OG-085 | Concluído |
| [OG-212](cards/OG-212-perfil-social.md) | Página de perfil social | E9 | 5 | Must | S15 | OG-200, OG-211 | Concluído |
| [OG-213](cards/OG-213-marcos.md) | Marcos (milestones) do jogador | E9 | 3 | Should | S15 | OG-211 | Concluído |
| [OG-214](cards/OG-214-relatorio-partida.md) | Relatório de partida | E9 | 5 | Must | S14 | OG-200 | Concluído |
| [OG-215](cards/OG-215-diretorio-jogadores.md) | Diretório e busca de jogadores | E9 | 3 | Should | S15 | OG-200, OG-211 | Concluído |
| [OG-216](cards/OG-216-cliente-portal-links.md) | Ligações entre o cliente e o portal | E9 | 2 | Won't (v2) | — | OG-212, OG-214 | Cancelado |
| [OG-220](cards/OG-220-pipeline-trilha.md) | Pipeline da trilha sonora | E10 | 2 | Must | S13 | — | Concluído |
| [OG-221](cards/OG-221-player-trilha.md) | Trilha sonora no menu e nas partidas | E10 | 3 | Must | S13 | OG-220 | Concluído |
| [OG-222](cards/OG-222-opcao-trilha.md) | Opção para desligar a trilha sonora | E10 | 2 | Must | S13 | OG-221 | Concluído |
| [OG-230](cards/OG-230-paridade-referencia.md) | Paridade vira referência: golden traces deixam de bloquear o CI | E11 | 2 | Should | — | — | Backlog |
| [OG-231](cards/OG-231-cadaver-parado.md) | Corpo do jogador eliminado continua se movendo | E11 | 2 | Must | S21 | — | Concluído |
| [OG-232](cards/OG-232-atalhos-navegador-so.md) | Atalhos do navegador e do sistema interrompendo a partida | E11 | 3 | Should | S21 | — | Concluído |
| [OG-250](cards/OG-250-formatos-series-ranked.md) | Formatos 3x3/4x4/5x5 e séries md1/md3/md5 no Ranked | E12 | 5 | Must | S17 | — | Concluído |
| [OG-251](cards/OG-251-rotacao-ranked-por-formato.md) | Rotação de mapas do Ranked por formato no painel admin | E12 | 3 | Must | S17 | OG-250 | Concluído |
| [OG-252](cards/OG-252-salas-lobby-ranked.md) | Salas de lobby Ranked: criar, listar e entrar (com senha opcional) | E12 | 5 | Must | S17 | OG-250 | Concluído |
| [OG-253](cards/OG-253-times-lobby-clas.md) | Times no lobby: clãs do mesmo lado e troca de lado | E12 | 3 | Must | S17 | OG-252 | Concluído |
| [OG-254](cards/OG-254-voto-pronto-contagem.md) | Voto de mapa, "Pronto" e contagem de 5 s | E12 | 5 | Must | S17 | OG-251, OG-252 | Concluído |
| [OG-255](cards/OG-255-lista-salas-ranked-cliente.md) | Tela de salas Ranked no cliente (lista, criar, entrar) | E12 | 3 | Must | S18 | OG-252 | Concluído |
| [OG-256](cards/OG-256-tela-lobby-ranked.md) | Tela do lobby Ranked: times, voto, "Pronto" e contagem | E12 | 5 | Must | S18 | OG-253, OG-254, OG-255 | Concluído |
| [OG-257](cards/OG-257-serie-placar-relatorio.md) | Série no jogo e no relatório: placar, próximo jogo e fim | E12 | 3 | Should | S18 | OG-250, OG-256, OG-265 | Concluído |
| [OG-258](cards/OG-258-filtro-formato-estatisticas.md) | Rating por formato e filtro (3x3/4x4/5x5) no ranking, perfil e partidas | E12 | 5 | Should | S19 | OG-250 | Concluído |
| [OG-259](cards/OG-259-cla-vs-cla-marcos.md) | Clã x clã: detecção e marcos | E12 | 3 | Should | S19 | OG-250 | Concluído |
| [OG-260](cards/OG-260-pausa-tatica.md) | Pausa tática por time no Ranked (servidor) | E12 | 5 | Must | S20 | OG-252 | Concluído |
| [OG-261](cards/OG-261-pausa-desconexao.md) | Pausa automática quando um jogador cai no Ranked | E12 | 3 | Must | S20 | OG-260 | Concluído |
| [OG-262](cards/OG-262-voto-bot-substituto.md) | Desconexão permanente: voto entre jogar com um a menos ou bot substituto | E12 | 5 | Must | S20 | OG-261 | Concluído |
| [OG-263](cards/OG-263-marca-partida-com-bots.md) | Marca "concluída com bots" em partidas Ranked | E12 | 2 | Must | S20 | OG-262 | Concluído |
| [OG-264](cards/OG-264-ui-pausa-voto-partida.md) | UI da pausa, da queda e do voto dentro da partida (sem mudar o HUD atual) | E12 | 3 | Must | S20 | OG-265, OG-260, OG-262 | Concluído |
| [OG-265](cards/OG-265-protecao-visual-hud.md) | Proteção visual da UI da partida: capturas de referência e comparação | E12 | 3 | Must | S18 | — | Concluído |
| [OG-266](cards/OG-266-nivel-bot-substituto.md) | Níveis de dificuldade dos bots e nível do bot substituto pelo histórico | E12 | 5 | Must | S20 | OG-262 | Concluído |
| [OG-267](cards/OG-267-temporadas-mensais.md) | Temporadas mensais automáticas e ranking geral de todas as temporadas | E12 | 3 | Must | S16 | — | Concluído |
| [OG-268](cards/OG-268-hall-da-fama.md) | Hall da fama | E12 | 3 | Should | S19 | OG-267, OG-274 | Concluído |
| [OG-270](cards/OG-270-clas-cadastro-api.md) | Clãs: cadastro, papéis e API (substitui a clan tag livre) | E13 | 5 | Must | S16 | — | Concluído |
| [OG-271](cards/OG-271-clas-convites-pedidos.md) | Clãs: convites e pedidos de entrada | E13 | 3 | Must | S16 | OG-270 | Concluído |
| [OG-272](cards/OG-272-clas-telas.md) | Telas de clã no cliente: criar, página do clã, gerir e buscar | E13 | 5 | Must | S16 | OG-270, OG-271 | Concluído |
| [OG-273](cards/OG-273-clas-estatisticas.md) | Estatísticas do clã | E13 | 3 | Should | S19 | OG-270, OG-259 | Concluído |
| [OG-274](cards/OG-274-ranking-clas.md) | Ranking de clãs | E13 | 3 | Should | S19 | OG-273, OG-267 | Concluído |
| [OG-275](cards/OG-275-clas-moderacao.md) | Moderação de clãs no painel admin | E13 | 2 | Should | S16 | OG-270 | Concluído |
| [OG-276](cards/OG-276-filtro-nomes-jogadores.md) | Filtro de nomes proibidos também nos nomes de jogador | E13 | 1 | Should | S42 | OG-275 | Concluído |
| [OG-277](cards/OG-277-sublinhado-conta-quem-entra-depois.md) | Quem entra depois não vê o sublinhado de conta dos que já estavam | E8 | 1 | Should | S21 | — | Concluído |
| [OG-278](cards/OG-278-erro-pixi-alphamode-resize.md) | Erro do Pixi (`alphaMode`) ao redimensionar a janela na partida | E8 | 2 | Should | S21 | — | Concluído |
| [OG-279](cards/OG-279-serie-com-vencedor.md) | Conferir série com vencedor (md3 2-1) de ponta a ponta | E12 | 1 | Should | S21 | — | Concluído |
| [OG-280](cards/OG-280-versao-no-cliente.md) | Mostrar a versão do jogo no cliente | E8 | 1 | Could | S22 | — | Concluído |
| [OG-281](cards/OG-281-espectador-player-nao-iniciado.md) | Espectador ao vivo às vezes abre com "player não iniciado" | E8 | 1 | Should | S21 | — | Concluído |
| [OG-282](cards/OG-282-online-sem-bots.md) | "Agora no Outgun" conta bots como jogadores online | E8 | 1 | Should | S21 | — | Concluído |
| [OG-283](cards/OG-283-atualizacao-automatica.md) | Telas do portal paradas: atualização automática mais frequente | E8 | 1 | Should | S21 | — | Concluído |
| [OG-284](cards/OG-284-portal-ao-vivo.md) | Portal ao vivo: novidades empurradas pelo servidor | E9 | 5 | Could | S42 | OG-283 | Concluído |
| [OG-285](cards/OG-285-opcoes-nao-salvam.md) | Opções não ficam salvas (cor favorita, mensagens rápidas) | E8 | 2 | Must | S21 | — | Concluído |
| [OG-286](cards/OG-286-powerups-somem-troca-sala.md) | Power-ups somem ao entrar numa sala | E11 | 1 | Must | S22 | — | Concluído |
| [OG-287](cards/OG-287-explosao-deathbringer.md) | Deathbringer sem explosão (anel e som) para os jogadores | E11 | 1 | Must | S22 | — | Concluído |
| [OG-288](cards/OG-288-tempos-powerup-nao-zeram.md) | Tempos de shadow, turbo e power não zeram no cliente ao perder o item | E11 | 1 | Must | S22 | — | Concluído |
| [OG-289](cards/OG-289-config-casual-pelo-cliente.md) | Configurar bots da sala Casual pelo cliente (quantidade e nível, inclusive variável) | E11 | 5 | Should | S22 | OG-266 | Concluído |
| [OG-290](cards/OG-290-modo-carnificina.md) | Modo Carnificina: power-ups no máximo o tempo todo (preset e `/carnage`) | E11 | 2 | Should | S22 | — | Concluído |
| [OG-291](cards/OG-291-tema-menu-campo.md) | Tema de menu "Campo": os menus com a cara do tema padrão da partida | E8 | 5 | Must | S23 | OG-200, OG-201 | Concluído |
| [OG-292](cards/OG-292-tema-menu-placar.md) | Tema de menu "Placar", à escolha nas Opções | E8 | 3 | Could | S24 | OG-291 | Concluído |
| [OG-293](cards/OG-293-hud-escala-layout-faixa.md) | HUD com escala pela resolução e layout em faixa (chat na largura toda, minimapa na linha do jogo) | E8 | 5 | Must | S25 | — | Concluído |
| [OG-294](cards/OG-294-placar-borda-a-borda.md) | Placar de borda a borda, com escala própria | E8 | 3 | Must | S25 | OG-293 | Concluído |
| [OG-295](cards/OG-295-hud-modo-coluna-telas-largas.md) | HUD em telas largas: modo coluna (16:9 e 16:10) | E8 | 3 | Must | S25 | OG-293, OG-294 | Concluído |
| [OG-296](cards/OG-296-opcao-escala-hud.md) | Opção "Escala do HUD" | E8 | 2 | Should | S25 | OG-293 | Concluído |
| [OG-297](cards/OG-297-estilo-hud-layout-componentes.md) | Opção "Estilo do HUD" e layout por componentes | E8 | 3 | Must | S26 | — | Concluído |
| [OG-298](cards/OG-298-hud-moderno.md) | HUD Moderno: sala grande e coluna do jogador (opção A) | E8 | 5 | Must | S26 | OG-297 | Concluído |
| [OG-299](cards/OG-299-placar-tab.md) | Placar completo no TAB (Moderno e Personalizado) | E8 | 2 | Must | S26 | OG-298 | Concluído |
| [OG-300](cards/OG-300-hud-personalizado-editor.md) | HUD Personalizado: editor de posição e tamanho dos componentes | E8 | 8 | Should | S26 | OG-298 | Concluído |
| [OG-301](cards/OG-301-faixa-serie-fora-da-sala.md) | Faixa da série do Ranked fora da sala no HUD Moderno e no Personalizado | E8 | 2 | Should | — | OG-298 | Backlog |
| [OG-302](cards/OG-302-classico-frags-no-tab.md) | Clássico com os frags só no TAB (opção) | E8 | 3 | Should | S26 | OG-299 | Concluído |
| [OG-303](cards/OG-303-arma-junto-dos-power-ups.md) | Arma no mesmo padrão e na mesma linha dos power-ups (HUD Moderno) | E8 | 1 | Should | S27 | OG-298 | Concluído |
| [OG-304](cards/OG-304-dominio-proprio.md) | Domínio próprio (outgunweb.com.br) com HTTPS atrás da Cloudflare | E8 | 1 | Must | S28 | — | Concluído |
| [OG-305](cards/OG-305-previa-de-compartilhamento.md) | Prévia de compartilhamento (Open Graph) para WhatsApp e redes | E8 | 1 | Should | S28 | OG-304 | Concluído |
| [OG-306](cards/OG-306-servidor-ssh-e-atualizacoes.md) | Servidor: SSH endurecido, atualizações e superfície mínima | E14 | 2 | Must | S29 | — | Concluído |
| [OG-307](cards/OG-307-backups-fora-do-servidor.md) | Backups cifrados fora do servidor, com teste de restauração | E14 | 3 | Must | — | — | Backlog |
| [OG-308](cards/OG-308-banco-menor-privilegio.md) | Banco com menor privilégio: papel da aplicação sem superusuário | E14 | 3 | Must | S29 | — | Concluído |
| [OG-309](cards/OG-309-github-cadeia-de-suprimentos.md) | GitHub e cadeia de suprimentos: varredura de segredos, Dependabot e proteção de branches | E14 | 2 | Must | S29 | — | Concluído |
| [OG-310](cards/OG-310-contas-dos-provedores-e-dns.md) | Contas dos provedores com MFA, DNS protegido e segredos arrumados | E14 | 1 | Must | — | — | Backlog |
| [OG-311](cards/OG-311-borda-hsts-websocket-divulgacao.md) | Borda: HSTS em tudo, origem do WebSocket e canal de divulgação de falhas | E14 | 2 | Should | S29 | — | Concluído |
| [OG-312](cards/OG-312-containers-endurecidos-e-rede.md) | Containers endurecidos, limites de memória e rede segmentada | E14 | 3 | Should | — | OG-308 | Backlog |
| [OG-313](cards/OG-313-logs-de-seguranca-e-alertas.md) | Logs de eventos de segurança e alertas ao PO | E14 | 3 | Should | S42 | OG-307 | Concluído |
| [OG-314](cards/OG-314-mfa-para-admins.md) | Segundo fator (TOTP) para contas admin e moderador | E14 | 5 | Should | — | — | Backlog |
| [OG-315](cards/OG-315-modo-foco-telas-visiveis.md) | Modo foco mostra as telas do F1–F5, o menu e os avisos | E8 | 1 | Must | S29 | — | Concluído |
| [OG-316](cards/OG-316-lobby-ranked-tema-dos-menus.md) | Lobby do Ranked com o tema dos menus (Campo ou Placar) | E8 | 1 | Should | S29 | — | Concluído |
| [OG-317](cards/OG-317-placar-classico-ordem-dos-frags.md) | Placar do HUD Clássico ordenado por frags | E8 | 1 | Should | S29 | — | Concluído |
| [OG-318](cards/OG-318-espectador-atraso-30s.md) | Espectador com 30 s de atraso | E6 | 1 | Must | S30 | — | Concluído |
| [OG-319](cards/OG-319-espectador-em-sala-com-senha.md) | Espectador também em salas com senha | E6 | 1 | Must | S30 | — | Concluído |
| [OG-320](cards/OG-320-botao-assistir-em-toda-sala.md) | Botão "Assistir" em toda sala, Casual e Ranked | E8 | 2 | Must | S30 | OG-319 | Concluído |
| [OG-321](cards/OG-321-nome-some-no-placar-cor-ciano.md) | Nome do jogador some no placar (cor ciano) | E8 | 2 | Must | S30 | — | Concluído |
| [OG-322](cards/OG-322-trilha-nova-e-tocador-na-tela-inicial.md) | Faixas novas, rotação no menu e tocador na tela inicial | E10 | 3 | Should | S31 | — | Concluído |
| [OG-323](cards/OG-323-app-instalavel-pelo-navegador.md) | Outgun instalável pelo navegador (PWA) | E7 | 2 | Should | S32 | — | Concluído |
| [OG-324](cards/OG-324-cliente-desktop-electron.md) | Cliente para Windows (Electron) que abre o site | E7 | 3 | Should | S32 | — | Concluído |
| [OG-325](cards/OG-325-pagina-de-download.md) | Página "Jogar no computador" e download do instalador | E7 | 2 | Should | S32 | OG-323, OG-324 | Concluído |
| [OG-326](cards/OG-326-cliente-mac-e-ubuntu.md) | Cliente para macOS e Ubuntu e ícones dos sistemas na página | E7 | 2 | Should | S32 | OG-324, OG-325 | Concluído |
| [OG-327](cards/OG-327-teste-do-tick-instavel.md) | Teste do tick com 32 conexões falha à toa | E7 | 2 | Should | — | — | Backlog |
| [OG-328](cards/OG-328-outgun-na-steam.md) | Outgun na Steam: cliente Electron por cima do jogo antigo (app 663760) | E7 | 3 | Should | S33 | OG-324, OG-326 | Concluído |
| [OG-329](cards/OG-329-serie-vencida-pelo-vermelho-recusada.md) | Série Ranked vencida pelo vermelho é recusada pela API | E12 | 1 | Must | S34 | — | Concluído |
| [OG-330](cards/OG-330-recuperar-mapa-2-da-serie-r-kvgwotx9.md) | Recuperar o mapa 2 da série r-kvgwotx9 a partir do replay | E12 | 2 | Must | S34 | OG-329 | Concluído |
| [OG-331](cards/OG-331-resultado-recusado-nao-se-perde.md) | Resultado de partida recusado pela API não se perde | E12 | 2 | Should | S34 | — | Concluído |
| [OG-332](cards/OG-332-volta-ao-ranked-em-andamento.md) | Quem caiu no Ranked não consegue voltar à partida (409) | E12 | 2 | Must | S35 | — | Concluído |
| [OG-333](cards/OG-333-nome-convidado-no-pedido-de-entrada.md) | Pedido de entrada manda o nome "Convidado" para quem está logado | E12 | 1 | Should | S35 | — | Concluído |
| [OG-334](cards/OG-334-musica-no-ranked.md) | Música também nas partidas Ranked | E10 | 1 | Must | S35 | — | Concluído |
| [OG-335](cards/OG-335-chat-bloqueado-por-flood.md) | Chat bloqueia na 3ª mensagem e o bloqueio nunca acaba | E11 | 2 | Must | S35 | — | Concluído |
| [OG-336](cards/OG-336-teclas-n-e-p-no-chat.md) | Mensagem não começa com "n" e o "p" pausa em vez de digitar | E11 | 2 | Must | S35 | — | Concluído |
| [OG-337](cards/OG-337-windows-em-tela-cheia.md) | Cliente para Windows abre em tela cheia | E7 | 1 | Should | S35 | — | Concluído |
| [OG-338](cards/OG-338-estilo-da-tag-do-cla.md) | Clã escolhe como a tag aparece: (nn), DT-, Dk. | E9 | 5 | Should | S35 | — | Concluído |
| [OG-339](cards/OG-339-opcoes-dentro-da-partida.md) | Opções e controles pelo Esc, sem sair da partida | E8 | 3 | Should | S35 | — | Concluído |
| [OG-340](cards/OG-340-hud-no-espectador-e-replay.md) | Espectador e replay com minimapa, placar e frags | E8 | 3 | Should | S35 | — | Concluído |
| [OG-341](cards/OG-341-ranked-20-minutos-com-prorrogacao.md) | Ranked com 20 min e prorrogação de 5 no empate | E12 | 2 | Must | S36 | — | Concluído |
| [OG-342](cards/OG-342-explicacao-do-rating.md) | Botão "i" explicando o rating | E12 | 3 | Must | S36 | — | Concluído |
| [OG-343](cards/OG-343-placar-final-7-em-vez-de-8.md) | Placar final mostra 7 em vez de 8 | E11 | 2 | Must | S36 | — | Concluído |
| [OG-344](cards/OG-344-modal-de-fim-de-partida.md) | Modal de fim de partida com resultado e detalhes | E8 | 5 | Must | S36 | OG-343 | Concluído |
| [OG-345](cards/OG-345-ranked-cancelada-sem-humanos.md) | Ranqueada cancelada quando um lado fica sem humanos | E12 | 3 | Must | S36 | — | Concluído |
| [OG-346](cards/OG-346-jogadores-demoram-a-aparecer.md) | Jogadores demoram a aparecer ao entrar na sala | E11 | 2 | Should | S36 | — | Concluído |
| [OG-347](cards/OG-347-minimapa-inimigo-morto.md) | Inimigo morto reaparece no minimapa onde morreu | E11 | 2 | Should | S36 | — | Concluído |
| [OG-348](cards/OG-348-voto-com-ctrl-1-e-ctrl-2.md) | Voto do substituto com Ctrl+1/Ctrl+2 | E12 | 2 | Must | S36 | — | Concluído |
| [OG-349](cards/OG-349-rating-openskill.md) | Rating de habilidade com OpenSkill (Plackett–Luce) | E12 | 5 | Must | S37 | — | Concluído |
| [OG-350](cards/OG-350-descontinuar-ranking-score-neg.md) | Descontinuar o ranking por score/neg | E12 | 5 | Must | S37 | OG-349 | Concluído |
| [OG-351](cards/OG-351-rating-no-perfil-e-relatorio.md) | Rating do OpenSkill no perfil e no relatório da partida | E9 | 5 | Must | S37 | OG-349 | Concluído |
| [OG-352](cards/OG-352-leaderboard-de-atributos-api.md) | Leaderboard de atributos: API | E12 | 3 | Must | S37 | — | Concluído |
| [OG-353](cards/OG-353-pagina-do-leaderboard.md) | Página do leaderboard mensal | E9 | 5 | Must | S37 | OG-352 | Concluído |
| [OG-354](cards/OG-354-hall-da-fama-pelo-leaderboard.md) | Hall da fama mensal pelo leaderboard | E12 | 3 | Must | S37 | OG-352, OG-350 | Concluído |
| [OG-358](cards/OG-358-lista-geral-do-mes.md) | Lista geral do mês (índice dos 6 stats principais) e selo de melhor do mês | E12 | 3 | Must | S37 | OG-352, OG-353, OG-354 | Concluído |
| [OG-359](cards/OG-359-link-da-steam-no-download.md) | Link da Steam na página de download | E7 | 1 | Should | S37 | OG-328 | Concluído |
| [OG-360](cards/OG-360-menu-inicial-enxuto.md) | Menu inicial enxuto (opções no menu superior) | E8 | 2 | Should | S37 | — | Concluído |
| [OG-361](cards/OG-361-notificacoes.md) | Notificações: sino no topo e aviso (toast) das não lidas | E9 | 5 | Should | S37 | — | Concluído |
| [OG-362](cards/OG-362-registro-de-eventos.md) | Registro dos eventos de cada ranqueada | E12 | 3 | Should | S38 | OG-355 | Concluído |
| [OG-363](cards/OG-363-multi-kill-troca-primeiro-abate.md) | Multi-kill, troca e primeiro abate no leaderboard | E12 | 3 | Should | S38 | OG-362 | Concluído |
| [OG-364](cards/OG-364-quem-matou-quem.md) | Quem matou quem: abates por vítima no relatório e no perfil | E9 | 2 | Could | S38 | OG-362 | Concluído |
| [OG-355](cards/OG-355-contadores-dano-zona-defesa.md) | Contadores novos: dano efetivo, abates por zona e defesas | E12 | 5 | Should | S38 | OG-352 | Concluído |
| [OG-356](cards/OG-356-registro-de-eventos-da-partida.md) | Registro de eventos da partida (quebrado em OG-362 a OG-364) | E12 | ~~8~~ | Could | S38 | OG-355 | Quebrado |
| [OG-357](cards/OG-357-balanceamento-de-times-no-lobby.md) | Balanceamento dos times no lobby pelo rating | E12 | 5 | Could | — | OG-349 | Backlog |
| [OG-365](cards/OG-365-presets-e-rotacao-na-criacao-de-sala.md) | Presets do painel e rotação oficial na criação de sala | E5 | 3 | Must | S38 | OG-087 | Concluído |
| [OG-366](cards/OG-366-envio-de-mapas-pelo-painel.md) | Envio de mapas .txt pelo painel de moderação | E5 | 5 | Should | S38 | OG-365 | Concluído |
| [OG-367](cards/OG-367-mapas-da-comunidade-no-jogo.md) | Mapas do painel nos servidores, nas rotações e no cliente | E5 | 3 | Should | S38 | OG-366 | Concluído |
| [OG-368](cards/OG-368-previa-dos-mapas-do-painel.md) | Prévia e miniatura dos mapas, inclusive os do painel | E5 | 3 | Should | S38 | OG-367 | Concluído |
| [OG-369](cards/OG-369-telemetria-de-latencia-de-input.md) | Medir a latência do input, da tecla ao servidor | E11 | 3 | Must | S39 | — | Concluído |
| [OG-370](cards/OG-370-input-por-sequencia.md) | Toda mudança de controle chega ao servidor a tempo | E11 | 5 | Must | S39 | OG-369 | Concluído |
| [OG-371](cards/OG-371-input-por-evento.md) | Teclas lidas no evento, não no quadro | E11 | 3 | Must | S39 | OG-370 | Concluído |
| [OG-372](cards/OG-372-tolerancia-de-diagonal-e-strafe.md) | Diagonal e Alt sem virar a arma por engano | E11 | 3 | Must | S39 | OG-371 | Concluído |
| [OG-373](cards/OG-373-fps-sem-limite-no-cliente-desktop.md) | FPS sem limite de verdade no cliente desktop (Steam) | E11 | 3 | Must | S39 | — | Concluído |
| [OG-374](cards/OG-374-quadro-de-baixa-latencia.md) | Quadro de baixa latência: menos trabalho por quadro e canvas dessincronizado | E11 | 2 | Could | S40 | OG-369, OG-373 | Concluído |
| [OG-375](cards/OG-375-spike-tick-e-subpassos.md) | Spike: tick de 20 Hz ou subpassos, sem mudar a sensação da física | E11 | 5 | Should | S40 | OG-370 | Concluído |
| [OG-376](cards/OG-376-webtransport.md) | Transporte por datagramas (WebTransport) para conexões com perda | E11 | 8 | Could | S42 | OG-370 | Concluído |
| [OG-377](cards/OG-377-mapas-do-painel-na-criacao-de-sala.md) | Mapas do painel em "Criar sala" quando não há rotação Casual no painel | E5 | 1 | Must | S40 | OG-367 | Concluído |
| [OG-378](cards/OG-378-rotacoes-do-painel-partem-da-atual.md) | Aba Rotações parte da rotação que está valendo | E5 | 2 | Must | S40 | OG-365 | Concluído |
| [OG-379](cards/OG-379-fim-de-partida-zerado.md) | Fim de partida com os números zerados no Casual | E12 | 2 | Must | S39 | OG-344 | Concluído |
| [OG-380](cards/OG-380-relatorio-no-visual-v2.md) | Relatório da partida no visual novo, com os marcadores novos à vista | E9 | 3 | Should | S40 | OG-355, OG-364 | Concluído |
| [OG-381](cards/OG-381-eventos-tambem-no-casual.md) | Registro de eventos também nas partidas Casual | E12 | 3 | Should | S39 | OG-362 | Concluído |
| [OG-382](cards/OG-382-presets-do-painel-em-formulario.md) | Presets do painel em formulário: regras por categoria, com caixas e campos | E5 | 5 | Should | S40 | OG-365 | Concluído |
| [OG-383](cards/OG-383-aba-rotacoes-por-modo.md) | Aba Rotações por modo: escolher Casual ou Ranqueado e marcar os mapas | E5 | 3 | Must | S40 | OG-378 | Concluído |
| [OG-384](cards/OG-384-sem-finlandes-e-italiano.md) | Tirar os idiomas finlandês e italiano | E8 | 1 | Must | S40 | — | Concluído |
| [OG-385](cards/OG-385-revisao-das-opcoes.md) | Revisão das opções do jogo: o que fica, o que sai | E8 | 2 | Should | S40 | — | Concluído |
| [OG-386](cards/OG-386-tirar-opcoes-legadas.md) | Tirar as opções legadas aprovadas na revisão | E8 | 3 | Should | S40 | OG-385 | Concluído |
| [OG-387](cards/OG-387-input-no-subpasso-sala-de-teste.md) | Opção de criar sala privada a 20 Hz (padrão continua 10 Hz) | E11 | 3 | Should | — | OG-375 | Backlog |
| [OG-388](cards/OG-388-moderacao-tela-cheia-e-papeis.md) | Moderação em tela cheia: presets e rotações aproveitando a largura, papéis em lista | E5 | 3 | Must | S40 | OG-382, OG-383 | Concluído |
| [OG-389](cards/OG-389-demais-abas-da-moderacao.md) | Demais abas da moderação no visual v2, na largura toda | E5 | 3 | Must | S40 | OG-388 | Concluído |
| [OG-390](cards/OG-390-marcos-dos-stats.md) | Marcos novos a partir dos stats da partida (vitórias, tempo, bandeira, defesa, combate) | E9 | 5 | Must | S41 | OG-355, OG-364 | Concluído |
| [OG-391](cards/OG-391-marcos-de-eventos-e-contexto.md) | Marcos de eventos e de contexto (armas, virada, ranked por formato, mapas, dupla, dias seguidos) | E9 | 5 | Must | S41 | OG-390, OG-362 | Concluído |
| [OG-392](cards/OG-392-marco-campeao-da-temporada.md) | Marco fora da partida: Campeão da temporada (top 3 do hall da fama) | E9 | 2 | Should | S41 | OG-390, OG-268 | Concluído |
| [OG-393](cards/OG-393-perfil-marcos-por-grupo-e-progresso.md) | Perfil no jogo: marcos por grupo, com ícone, progresso, raridade e secretos | E9 | 5 | Must | S41 | OG-390, OG-395 | Concluído |
| [OG-394](cards/OG-394-aviso-de-marco-novo.md) | Aviso de marco novo: no relatório da partida e um toast ao voltar ao menu | E9 | 2 | Should | S41 | OG-390 | Concluído |
| [OG-395](cards/OG-395-icones-dos-marcos.md) | Ícones dos marcos gerados por script (perfil e Steam) | E9 | 3 | Must | S41 | — | Concluído |
| [OG-396](cards/OG-396-steam-conquistas-no-app.md) | Steam: conquistas no app desktop, espelhando os marcos da conta | E9 | 5 | Should | S41 | OG-390, D-77 | Concluído |
| [OG-397](cards/OG-397-steam-cadastro-das-conquistas.md) | Steam: tabela das conquistas e cadastro no Steamworks | E9 | 2 | Should | S41 | OG-395, OG-396 | Concluído |
| [OG-398](cards/OG-398-marcos-secretos.md) | Marcos secretos: os 10 raros, anti-farm, primeiro a descobrir e calibração | E9 | 5 | Must | S41 | OG-391 | Concluído |
| [OG-399](cards/OG-399-marcos-de-humor.md) | Marcos de humor (7x1, freguês, mão de alface...) e a virada do 7x1 | E9 | 4 | Should | S41 | OG-391, OG-398 | Concluído |
| [OG-400](cards/OG-400-fps-travado-em-60-na-steam.md) | FPS travado em 60 no cliente da Steam | E12 | 2 | Must | S41 | OG-373, OG-374, OG-396 | Concluído |
| [OG-401](cards/OG-401-resolucao-do-monitor-no-windows.md) | Resolução do monitor no cliente para Windows | E12 | 5 | Should | S41 | OG-337, OG-400 | Concluído |
| [OG-402](cards/OG-402-pioneiro-ate-31-de-outubro.md) | Pioneiro para quem jogar até 31 de outubro | E9 | 1 | Must | S41 | OG-390 | Concluído |
| [OG-403](cards/OG-403-bots-nomes-e-prefixo-no-painel.md) | Bots no painel de moderação: cadastro de nomes e de prefixos | E13 | 3 | Should | S42 | OG-377 | Concluído |
| [OG-404](cards/OG-404-bots-falam-no-chat.md) | Bots falam no chat conforme o que acontece na partida | E13 | 5 | Should | S42 | OG-403, OG-362 | Concluído |
| [OG-405](cards/OG-405-webtransport-no-game-server.md) | WebTransport no game server, com o WebSocket de reserva | E11 | 5 | Should | — | OG-376 | Backlog |
| [OG-406](cards/OG-406-cliente-webtransport-com-reserva.md) | Cliente escolhe WebTransport e cai no WebSocket sem o jogador perceber | E11 | 3 | Should | — | OG-405 | Backlog |
| [OG-407](cards/OG-407-cores-do-cla.md) | Cores primária e secundária do clã | E9 | 3 | Should | S43 | OG-275 | Concluído |
| [OG-408](cards/OG-408-identidade-do-time-na-partida.md) | Identidade do clã na partida: quando o lado vira o clã (servidor) | E9 | 3 | Should | S43 | OG-407 | Concluído |
| [OG-409](cards/OG-409-time-com-a-cor-do-cla.md) | Time com a cor e o nome do clã na tela (cliente) | E9 | 5 | Should | S43 | OG-408 | Concluído |
| [OG-410](cards/OG-410-numeros-de-jogador.md) | Números de jogador (2 a 99, o 1 para o líder do mês) | E9 | 5 | Should | S43 | OG-358 | Concluído |
| [OG-411](cards/OG-411-mais-cores-pessoais.md) | 32 cores pessoais e as medalhas do top 3 | E9 | 3 | Should | S43 | OG-358 | Concluído |
| [OG-412](cards/OG-412-notificacoes-atras-do-tocador.md) | Notificações atrás do tocador de música | E8 | 1 | Must | S43 | OG-361 | Concluído |
| [OG-413](cards/OG-413-estilos-do-numero.md) | Estilos do número do jogador | E9 | 3 | Should | S43 | OG-410 | Concluído |
| [OG-414](cards/OG-414-cla-no-replay-e-espectador.md) | Cores e nome do clã no replay e no espectador | E9 | 2 | Should | — | OG-409 | Backlog |
| [OG-415](cards/OG-415-trava-do-numero-desligada.md) | Trava da troca de número desligada | E9 | 1 | Must | S43 | OG-410 | Concluído |
| [OG-416](cards/OG-416-ux-da-comunidade.md) | Melhorias de UX da comunidade (PR #5) | E8 | 5 | Should | S44 | OG-200 | Concluído |
| [OG-417](cards/OG-417-celular-portao-por-rota.md) | Celular de volta: portão por rota | E8 | 2 | Must | S45 | OG-209, OG-416 | Concluído |
| [OG-418](cards/OG-418-barra-e-navegacao-no-celular.md) | Barra de cima, navegação e base responsiva no celular | E8 | 3 | Must | S45 | OG-417 | Concluído |
| [OG-419](cards/OG-419-inicio-do-celular.md) | Tela inicial do celular (portal) | E8 | 3 | Must | S45 | OG-418 | Concluído |
| [OG-420](cards/OG-420-conta-no-celular.md) | Entrar, cadastro e conta no celular | E8 | 2 | Must | S45 | OG-418 | Concluído |
| [OG-421](cards/OG-421-perfil-no-celular.md) | Perfil do jogador no celular | E9 | 3 | Must | S45 | OG-418 | Concluído |
| [OG-422](cards/OG-422-cla-no-celular.md) | Clã no celular: perfil, estatísticas e ranking de clãs | E9 | 3 | Must | S45 | OG-418 | Concluído |
| [OG-423](cards/OG-423-ranking-no-celular.md) | Ranking, hall da fama e jogadores no celular | E9 | 3 | Should | S45 | OG-418 | Concluído |
| [OG-424](cards/OG-424-relatorio-no-celular.md) | Relatório da partida e da série no celular | E9 | 3 | Must | S45 | OG-418 | Concluído |
| [OG-425](cards/OG-425-pdf-do-relatorio.md) | PDF do relatório completo da partida | E9 | 5 | Must | S45 | OG-380 | Concluído |
| [OG-426](cards/OG-426-pdf-da-serie.md) | PDF do relatório da série | E9 | 2 | Should | S45 | OG-425 | Concluído |
| [OG-427](cards/OG-427-moderacao-no-celular.md) | Moderação no celular | E8 | 5 | Must | S45 | OG-418, OG-420 | Concluído |
| [OG-428](cards/OG-428-deathbringer-congela-a-tela.md) | Tela congela depois da explosão do Deathbringer (issue #6) | E11 | 3 | Must | S46 | — | Concluído |
| [OG-429](cards/OG-429-formulario-de-bug-no-site.md) | Formulário de bug no site | E8 | 3 | Must | S46 | OG-106, OG-203 | Concluído |
| [OG-430](cards/OG-430-issue-no-github-pelo-painel.md) | Abrir a issue no GitHub pelo painel | E7 | 3 | Must | S46 | OG-429 | Concluído |
| [OG-431](cards/OG-431-retorno-do-relato-ao-jogador.md) | Retorno do relato ao jogador | E9 | 2 | Should | S46 | OG-430 | Concluído |
| [OG-432](cards/OG-432-issues-viram-cards.md) | Issues de bug viram cards | E7 | 2 | Should | S46 | — | Concluído |
| [OG-433](cards/OG-433-feedback-na-barra.md) | "Enviar feedback" na barra de cima | E8 | 1 | Must | — | OG-429 | Concluído |
| [OG-434](cards/OG-434-erros-do-cliente-no-sentry.md) | Erros do cliente e dos servidores no Sentry | E7 | 2 | Must | — | OG-102, OG-428 | Concluído |
| [OG-435](cards/OG-435-telemetria-de-automacao.md) | Telemetria de automação por jogador e partida | E7 | 5 | Should | — | OG-028, OG-104 | Backlog |
| [OG-436](cards/OG-436-score-de-suspeita-e-fila-de-revisao.md) | Score de suspeita de automação e fila de revisão | E7 | 5 | Should | — | OG-435, OG-389 | Backlog |
| [OG-437](cards/OG-437-isca-de-mira-alvo-fantasma.md) | Spike: isca de mira (alvo fantasma por cliente) | E7 | 5 | Could | — | OG-042, OG-104 | Backlog |
| [OG-438](cards/OG-438-revisao-de-partida-suspeita.md) | Revisão de partida suspeita no painel | E7 | 3 | Should | — | OG-436, OG-380 | Backlog |
| [OG-439](cards/OG-439-resposta-gradual-aviso-ban-e-recurso.md) | Resposta gradual: advertência, ban explicado e recurso | E7 | 5 | Should | — | OG-438 | Backlog |
| [OG-440](cards/OG-440-evasao-de-ban-correlacao-de-contas.md) | Evasão de ban: correlação de contas e dispositivos | E7 | 5 | Could | — | OG-104, OG-087 | Backlog |
| [OG-441](cards/OG-441-punicao-em-sombra.md) | Punição em sombra: suspeito confirmado joga separado | E7 | 5 | Could | — | OG-439, OG-053 | Backlog |
| [OG-442](cards/OG-442-deathbringer-travou-meu-jogo.md) | Tela congela depois da explosão do Deathbringer (de novo) (issue #7) | E11 | 2 | Must | S47 | — | Concluído |
| [OG-443](cards/OG-443-deathbringer-travando-ao-voltar-estou-sem.md) | Número do jogador some ao voltar para a partida (issue #8) | E11 | 2 | Must | S47 | — | Concluído |
| [OG-444](cards/OG-444-nao-tem-botao-de-sair.md) | Botão "Sair do Outgun" no app desktop (issue #9) | E11 | 2 | Should | S47 | — | Concluído |
| [OG-445](cards/OG-445-sala-com-16-nao-sai-bot.md) | Sala cheia de bots recusa a entrada de humano (issue #10) | E11 | 2 | Must | S47 | — | Concluído |
| [OG-446](cards/OG-446-bot-com-foguete-de-outro-mapa.md) | Bot quebra com tiro do mapa anterior depois da troca de mapa (Sentry) | E11 | 1 | Should | S47 | — | Concluído |
| [OG-447](cards/OG-447-convite-pela-steam-base.md) | Convite pela Steam: overlay, lobby da Steam e entrada pelo convite | E9 | 5 | Should | — | OG-328, OG-396, OG-400 | Backlog |
| [OG-448](cards/OG-448-convidar-ao-criar-sala.md) | Convidar amigos da Steam na criação da sala personalizada | E9 | 2 | Should | — | OG-447 | Backlog |
| [OG-449](cards/OG-449-convidar-no-menu-da-partida.md) | "Convidar amigo (Steam)" no menu da partida | E9 | 2 | Should | — | OG-447 | Backlog |
| [OG-450](cards/OG-450-convidar-no-lobby-ranked.md) | Convidar amigo da Steam no lobby Ranked | E12 | 3 | Could | — | OG-447, D-82 | Backlog |
| [OG-451](cards/OG-451-cards-no-plane.md) | Cards espelhados no Plane | E7 | 3 | Should | — | — | Concluído |
| [OG-452](cards/OG-452-alloy-grafana-cloud.md) | Métricas e logs do beta no Grafana Cloud (Grafana Alloy) | E7 | 5 | Must | S48 | — | Concluído |
| [OG-453](cards/OG-453-metricas-do-banco.md) | Métricas do banco: pg_stat_statements e exporter do Postgres | E7 | 3 | Must | S48 | OG-452 | Concluído |
| [OG-454](cards/OG-454-metricas-de-quedas.md) | Métricas de quedas no game server: conexões fechadas e salas encerradas | E7 | 2 | Should | S48 | — | Concluído |
| [OG-455](cards/OG-455-paineis-e-alertas-no-grafana-cloud.md) | Painéis e alertas no Grafana Cloud | E7 | 3 | Must | S48 | OG-452, OG-453, OG-454 | Concluído |
| [OG-456](cards/OG-456-alarmes-na-oracle.md) | Alarmes da Oracle: CPU, memória e máquina fora do ar | E7 | 1 | Should | S48 | — | Concluído |
| [OG-457](cards/OG-457-coletor-leve-para-a-micro.md) | Coletor leve para a E2.1.Micro (Fluent Bit no lugar do Alloy) | E7 | 3 | Should | S49 | OG-452 | Concluído |
| [OG-458](cards/OG-458-voto-f2-e-troca-f8-vao-ao-mapa-errado.md) | Voto no mapa (F2) com pedido de troca (F8) não vai para o mapa votado (issue #11) | E11 | 2 | Should | S50 | — | Concluído |
| [OG-459](cards/OG-459-idle-kick-com-poucos-humanos.md) | Jogador parado não é expulso na sala com poucos humanos (issue #14) | E11 | 2 | Won't (v2) | S50 | — | Cancelado |
| [OG-460](cards/OG-460-item-na-base-nao-e-pego.md) | Item na base que aparece na tela, mas não é pego (issue #15) | E11 | 2 | Should | S50 | — | Concluído |
| [OG-461](cards/OG-461-lobby-ranked-esc-e-botao-de-som.md) | Lobby Ranked: Esc tira o lobby da tela e falta o botão de som (issues #16 e #17) | E12 | 2 | Should | S50 | — | Concluído |
| [OG-462](cards/OG-462-diagonal-e-alt-rapidos.md) | Diagonal + Alt rápidos ainda registram a direção errada (issue #18) | E11 | 3 | Should | S50 | — | Concluído |
| [OG-463](cards/OG-463-nome-do-cla-no-lugar-do-time.md) | Nome do clã no lugar de "Time vermelho/azul" (issue #19) | E13 | 2 | Could | S50 | — | Concluído |
| [OG-464](cards/OG-464-historico-do-lobby-ranked-manter.md) | Lobby Ranked guarda todo o histórico do chat (issue #20) | E12 | 2 | Should | S50 | — | Concluído |
| [OG-465](cards/OG-465-apos-mandar-um-feedback-limpar-campos.md) | Relato de bug: limpar o formulário depois de enviar e deixar mandar outro (issue #21) | E9 | 1 | Should | S50 | — | Concluído |
| [OG-466](cards/OG-466-tolerancia-de-diagonal.md) | Tolerância de diagonal ajustável de 1 em 1 ms (issue #22) | E11 | 1 | Should | S50 | — | Concluído |
| [OG-467](cards/OG-467-destacar-se-ao-nascer-retomada-dessa.md) | Volta a opção "Destacar a si mesmo ao nascer" (issue #23) | E11 | 1 | Should | S50 | — | Concluído |
| [OG-468](cards/OG-468-replay.md) | Replay sem som (e o +/- do teclado numérico é zoom, não volume) (issue #24) | E11 | 3 | Should | S50 | — | Concluído |
| [OG-469](cards/OG-469-radar-api-eixos-e-arquetipo.md) | Radar de estilo: API com os 6 eixos em percentil e o arquétipo | E9 | 5 | Must | — | OG-358, OG-363 | Backlog |
| [OG-470](cards/OG-470-componente-radar.md) | Componente de radar no design system (SVG, tooltip, tracejado, mini e tabela) | E9 | 3 | Must | — | OG-200 | Backlog |
| [OG-471](cards/OG-471-radar-no-perfil.md) | Radar no perfil: arquétipo, temporada passada em tracejado e filtros | E9 | 3 | Must | — | OG-469, OG-470 | Backlog |
| [OG-472](cards/OG-472-jogador-x-jogador.md) | Jogador x jogador: "Comparar comigo" no radar | E9 | 3 | Must | — | OG-471 | Backlog |
| [OG-473](cards/OG-473-radar-do-cla.md) | Radar do clã: mediana dos membros e mini radar de cada membro | E13 | 3 | Must | — | OG-469, OG-470, OG-273 | Backlog |
| [OG-474](cards/OG-474-cla-x-cla-previa-do-confronto.md) | Clã x clã: prévia do confronto com a escalação e radar contra um rival | E13 | 3 | Must | — | OG-473 | Backlog |
| [OG-475](cards/OG-475-radar-da-partida-no-relatorio.md) | Radar da partida no relatório: a partida por cima da média da temporada | E9 | 3 | Should | — | OG-469, OG-470 | Backlog |
| [OG-476](cards/OG-476-sombra-de-referencia.md) | Sombra de referência no radar: média do clã ou top 10 do mês | E9 | 2 | Should | — | OG-471 | Backlog |
| [OG-477](cards/OG-477-radar-dos-times-no-lobby.md) | Radar dos dois times no lobby Ranked antes de começar | E12 | 3 | Should | — | OG-469, OG-470 | Backlog |
| [OG-478](cards/OG-478-cartao-para-compartilhar.md) | Cartão do estilo para compartilhar (imagem com radar, arquétipo e clã) | E9 | 3 | Could | — | OG-471 | Backlog |
| [OG-479](cards/OG-479-filtro-por-mapa.md) | Filtro por mapa no radar | E9 | 2 | Could | — | OG-471 | Backlog |
| [OG-480](cards/OG-480-emblema-modelo-e-render.md) | Emblema do clã: modelo, molduras e desenho vetorial compartilhado | E13 | 5 | Must | — | OG-407 | Backlog |
| [OG-481](cards/OG-481-emblema-catalogo-de-simbolos.md) | Emblema do clã: catálogo final de símbolos (28 desenhos próprios) | E13 | 5 | Must | — | OG-480 | Backlog |
| [OG-482](cards/OG-482-emblema-api.md) | Emblema do clã: API, unicidade e permissões (líder e admins) | E13 | 5 | Must | — | OG-480 | Backlog |
| [OG-483](cards/OG-483-emblema-editor.md) | Emblema do clã: editor na página do clã | E13 | 3 | Must | — | OG-481, OG-482 | Backlog |
| [OG-484](cards/OG-484-emblema-no-portal.md) | Emblema do clã nas telas do portal e no lobby Ranked | E13 | 3 | Must | — | OG-482 | Backlog |
| [OG-485](cards/OG-485-emblema-na-identidade-e-relatorio.md) | Emblema do clã na identidade do lado, no relatório e no PDF | E13 | 3 | Must | — | OG-482 | Backlog |
| [OG-486](cards/OG-486-emblema-no-chao-da-base.md) | Emblema do clã no chão da base, na partida | E13 | 5 | Must | — | OG-485 | Backlog |
| [OG-487](cards/OG-487-emblema-no-fim-da-partida.md) | Emblema do clã no fim de rodada e de partida | E13 | 2 | Must | — | OG-485 | Backlog |
| [OG-488](cards/OG-488-emblema-molduras-do-hall.md) | Emblema do clã: molduras do hall da fama (ouro, prata e bronze) | E13 | 3 | Should | — | OG-482, OG-483 | Backlog |
| [OG-489](cards/OG-489-emblema-compartilhar.md) | Emblema do clã: imagem do confronto e PNG do emblema | E13 | 3 | Could | — | OG-484, OG-485 | Backlog |
| [OG-490](cards/OG-490-treino-ciclo-da-tentativa.md) | Treino: sala de treino e ciclo da tentativa no servidor | E11 | 5 | Must | — | OG-289 | Backlog |
| [OG-491](cards/OG-491-treino-papeis-dos-bots.md) | Treino: papéis fixos dos bots (guardar base, atacar, perseguir, levar e escoltar a bandeira) | E11 | 8 | Must | — | OG-490 | Backlog |
| [OG-492](cards/OG-492-treino-presets-na-sala-privada.md) | Treino: presets de treino na criação da sala privada | E11 | 3 | Must | — | OG-490 | Backlog |
| [OG-493](cards/OG-493-treino-ataque.md) | Treino Ataque: entrar na base e sair do quadrado com a bandeira | E11 | 3 | Must | — | OG-490, OG-491 | Backlog |
| [OG-494](cards/OG-494-treino-defesa.md) | Treino Defesa: segurar a onda de atacantes | E11 | 3 | Must | — | OG-490, OG-491 | Backlog |
| [OG-495](cards/OG-495-treino-fuga.md) | Treino Fuga: da base inimiga até a sua com a bandeira | E11 | 3 | Must | — | OG-490, OG-491 | Backlog |
| [OG-496](cards/OG-496-treino-captura.md) | Treino Captura: alcançar o portador e devolver a bandeira | E11 | 3 | Must | — | OG-490, OG-491 | Backlog |
| [OG-497](cards/OG-497-treino-com-convidados.md) | Treino com convidados: escolher o lado, junto ou contra | E11 | 5 | Must | — | OG-490, OG-492 | Backlog |
| [OG-498](cards/OG-498-treino-fora-das-estatisticas.md) | Treino não conta para nada: estatísticas, ranking, radar, relatórios e marcos | E11 | 2 | Must | — | OG-490 | Backlog |
| [OG-499](cards/OG-499-treino-dificuldade-progressiva.md) | Treino: dificuldade que sobe sozinha | E11 | 2 | Should | — | OG-490, OG-491 | Backlog |
| [OG-500](cards/OG-500-treino-inicio-variado.md) | Treino: início variado a cada tentativa | E11 | 3 | Should | — | OG-493, OG-494, OG-495, OG-496 | Backlog |

**Total:** 342 cards, 1105 pontos — v1: 69 cards, 295 pts (OG-048 quebrado em OG-050 a OG-054, seus 13 pts saem da soma; OG-105 quebrado na S12 em OG-106 a OG-109 e reestimado em 3 pts); v2: 273 cards, 810 pts (OG-210, OG-216, OG-205 e OG-459 cancelados, 14 pts fora da soma; OG-356 quebrado em OG-362 a OG-364, seus 8 pts saem da soma).

---

## 11. Riscos
| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Física "parecida mas não igual" frustra veteranos | Alta | Alto | Harness de paridade (OG-003/100) desde o S1; beta com veteranos |
| R2 | Original não compila em toolchain moderna | Média | Alto | Docker com GCC antigo (ex.: `gcc:4.9`/Debian antigo) e Allegro 4.4; plano B: build só do servidor dedicado (`DEDICATED_SERVER_ONLY`) |
| R3 | `sin`/`cos`/`sqrt` diferem entre libm e V8 | Média | Médio | Tolerância 1e-9 e ressincronização por frame no comparador; testes por função |
| R4 | Latência de WebSocket (TCP) em redes ruins | Média | Médio | 10 Hz + predição tolera; WebTransport no v2 |
| R5 | Trapaça (bots, speedhack) | Média | Alto | Servidor autoritativo, AOI, validação de taxa de input, detecção de anomalias |
| R6 | Licença GPL mal aplicada | Baixa | Alto | OG-005 antes de qualquer publicação |
| R7 | Port dos bots (2,1k linhas de IA) maior que o estimado | Alta | Médio | Card de 13 pts quebrado no refinamento; bots simples primeiro |
| R8 | Escopo de plataforma cresce (social, clãs...) | Média | Médio | MoSCoW rígido; itens novos vão para v2 |

---

## 12. Decisões em aberto
| ID | Decisão | Opções | Recomendação | Dono |
|---|---|---|---|---|
| D-01 | Defaults: código ou `gamemod.txt`? | Código / gamemod | ✅ **Decidido em 2026-10-12:** o preset Clássico segue o `config/gamemod.txt` distribuído; defaults do código ficam documentados no schema | PO |
| D-02 | Ordenação do leaderboard (script PHP do master não está no repo) | Rating clássico / Glicko-2 / TrueSkill | ✅ **Decidido em 2026-10-12:** rating clássico `(score+1)/(neg+1)` na v1; avaliar Glicko-2 na v2 **Substituída pelas D-65/D-66 (2026-10-22).** | PO |
| D-03 | Framework de salas | Próprio (uWS) / Colyseus | ✅ **Aprovado pelo PO em 2026-10-12:** **Próprio** | Tech Lead |
| D-04 | Hospedagem | Fly.io / Hetzner / AWS | ✅ **Aprovado pelo PO em 2026-10-12:** Fly.io no beta (regiões e WS simples) | Tech Lead |
| D-05 | Visão de salas vizinhas por padrão | Só a sala atual (original) / zoom | ✅ **Aprovado pelo PO em 2026-10-12:** Original por padrão; zoom como opção não ranqueada? | PO |
| D-06 | Suporte a mobile/touch | v1 / v2 | ✅ **Aprovado pelo PO em 2026-10-12:** v2 | PO |
| D-07 | Licença do servidor: GPL ou AGPL? | GPL-2.0-or-later / AGPL-3.0-or-later | ✅ **Aprovado pelo PO em 2026-10-12:** **GPL-2.0-or-later** em todo o monorepo (mesma do original, sem combinações de versões). A GPL não obriga a publicar o código de um servidor que não é distribuído, mas o projeto publica tudo por decisão própria (link no jogo). AGPL só se quisermos obrigar forks hospedados a publicar o código | PO |
| D-08 | Uso do nome "Outgun" e contato com os autores | Usar o nome / nome derivado | ✅ **Aprovado pelo PO em 2026-10-12:** Tentar contato com Niko Ritari e Jani Rivinoja (README.txt) antes do beta público; até lá, usar "Outgun Web" com créditos completos (`CREDITS.md`) | PO |
| D-09 | Relógio da simulação | Relógio de parede como o original (`get_time()`) / determinístico (`frame / 10`) | ✅ **Decidido no OG-003 (divergência intencional):** determinístico. O original mede expirações com o relógio do servidor, que oscila alguns ms entre frames e pode mudar uma expiração em ±1 frame; a versão web usa `tempo = frame / 10`. O harness alimenta a sim TS com o tempo gravado, então a paridade não é afetada | Tech Lead |
| D-10 | Power-ups e modos de jogo | Modo único como o original / Casual com power-ups + Ranked sem power-ups | ✅ **Decidido pelo PO em 2026-10-12 (divergência intencional):** dois modos (RN-MOD). Ranked é obrigatoriamente sem power-ups e exige conta com usuário + senha (e-mail só para recuperação). Casual mantém power-ups e aceita convidados | PO |
| D-11 | Bots em salas Ranked | Proibidos / permitidos só para completar times (sem contar para ranking) / permitidos como no original | ✅ **Decidido pelo PO em 2026-10-12:** **proibidos no Ranked** (RN-MOD-06). Bots alteram o resultado e o modificador de time do ranking; no Casual continuam como no original. | PO |
| D-12 | Sons em WAV | WAV / OGG+AAC | ✅ **Aprovado pelo PO em 2026-10-12:** WAV (768 KB, suportado por todos os navegadores); compressão vira card se o orçamento exigir | PO |
| D-13 | Render de salas: antialiasing e escala das texturas | Cobertura exata como o `SceneAntialiaser` / antialiasing do Canvas 2D | ✅ **Decidido no OG-061 (divergência intencional):** Canvas 2D do navegador, com paredes da mesma textura unidas num só caminho (sem costuras); texturas com 1 texel = 1 pixel CSS (em telas de alta densidade ficam do tamanho aparente do original); sem o modo sem antialiasing e sem o modo info do mapa. Comparação com o original: ≤ 0,5% de pixels diferentes (plan/specs/render-salas.md) | Tech Lead |
| D-14 | Render de entidades: suavização e sorteios visuais | Pixel a pixel como a Allegro / formas suavizadas | ✅ **Decidido no OG-062 (divergência intencional):** formas procedurais suavizadas (Graphics do PixiJS) e sprites girados com filtro linear; sorteios só visuais (cor das explosões, tremor do turbo e do escudo, fumaça) com `Math.random`, fora da simulação. Marcadores de vizinhos, bandeiras desaparecidas e mira do giro livre vão para o OG-065 (plan/specs/render-entidades.md) | Tech Lead |
| D-15 | Teclas no navegador | Só as do original / remapeáveis + gamepad | ✅ **Decidido no OG-063 (divergência intencional):** esquema Clássico (teclas do original) por padrão e esquema Navegador (Espaço/Z/X, sem Ctrl/Alt); tudo remapeável e salvo no navegador; gamepad padrão (botões 0/1/2 = tiro/correr/esquiva, como o joystick do original); teclas por posição física. Atalhos que o navegador não deixa capturar (Ctrl+W/T/N) têm o **modo foco** (F10: tela cheia + `keyboard.lock`) e confirmação ao fechar a aba; captura de tela em F9; sem mira por mouse na v1 (plan/specs/entrada.md) | Tech Lead |
| D-16 | Formato do snapshot e do minimapa | Bits do original / campos do protocolo v1 | ✅ **Decidido no OG-042 (divergência intencional):** mesmas regras de visibilidade do `broadcast_frame` (sala, shadow, portadores, rodízio do minimapa, propriedades remotas, eventos só para quem vê); minimapa como lista de pids (sem a máscara compactada) e rodízio sem o arredondamento para múltiplos de 4; `rocketDelete` sem o código 252 (o alvo com escudo vai como alvo normal; o pisca fica a cargo do cliente pelo escudo). Tráfego medido: 4,4 KB/s por cliente com 32 jogadores (plan/specs/snapshots-aoi.md) | Tech Lead |
| D-17 | Entrada do cliente no servidor | Como o original / com limite de taxa e histórico redundante | ✅ **Decidido no OG-043 (divergência intencional):** ordem dos inputs como o original (janela de 128 num contador de 8 bits), limite de taxa por tipo de mensagem (balde de fichas por tick) e expulsão por `client_misbehavior`; **sem histórico redundante de inputs**: os controles são estado absoluto (basta o mais novo), os eventos discretos (tiro, largar bandeira, suicídio, troca de time) vão no canal confiável, o WebSocket não perde pacotes e, num transporte sem garantia (v2), a regra de ordem já descarta os atrasados; um histórico só gastaria banda e abriria espaço para reescrever frames passados. Decisão delegada pelo PO ao time técnico em 2026-10-13 (plan/specs/entrada-servidor.md) | Tech Lead |
| D-18 | Predição e desenho no cliente | Como o original (extrapolação, predição desligada) / predição ligada e suavização | ✅ **Decidido no OG-064 (divergência intencional):** mesma extrapolação do original (`ClientWorld::extrapolate`: o próprio jogador com os controles ainda não confirmados, os outros com os últimos controles conhecidos, foguetes simulados a partir dos eventos) e mesma sincronização de envio (`frameOffset`); diferenças: **predição ligada por padrão** (quantidade 10; a opção e o "handicap" 0..10 continuam no menu), relógio estimado do servidor em vez do tempo desde a chegada do último frame (o jitter não sacode o desenho), extrapolação em frames inteiros, troca de sala liberada para o jogador previsto e **suavização das correções** (meia-vida de 80 ms, sem suavizar saltos > 48 px). Interpolação "no passado" para os outros jogadores foi descartada: mostraria inimigos ~100 ms atrasados e pioraria a mira num jogo com foguetes lentos. Resultado: 0,1–0,2 correções/s com 150 ms de RTT e 2% de perda; nave responde em 10–60 ms. Decisão delegada pelo PO ao time técnico em 2026-10-13 (plan/specs/predicao-interpolacao.md) | Tech Lead |
| D-19 | HUD da partida | Como o original / adaptado ao navegador | ✅ **Decidido no OG-065:** layout, barras, placar, minimapa, mensagens e chat como o original (`make_layout` com o canvas como tela), F12 alterna minimapa e placar como no original (fora do modo foco o navegador pode abrir as ferramentas de desenvolvimento; a tecla é remapeável); o servidor passa a mandar placar, tempo de mapa, timers de power-up e arma e a repassar o chat (comandos `/` e moderação no OG-046); mensagens com cor usam a tradução sem cor quando o catálogo do 1.0.3 não tem a versão com cor (pt-BR ganhou as versões com cor). Decisão delegada pelo PO ao time técnico em 2026-10-13 (plan/specs/hud.md) | Tech Lead |
| D-20 | Nomes de jogador | Como o original (`makeComparable` ASCII, nome protegido por senha no `auth.txt`, troca livre em jogo) / conta é o nome protegido | ✅ **Decidido no OG-082 (divergência intencional):** validação igual ao `check_name` (+ só Latin-1, por causa das fontes); comparação = `makeComparable` com **acentos dobrados** (José = JOSE = jose); nome registrado precisa de letra ou dígito; convidado não usa nome de conta nem reservado e aparece com sufixo `*`; troca de nome pela conta a cada 30 dias, nome antigo reservado ao dono por 90 dias; clan tag definida na conta (1–6 caracteres, sem parênteses), exibida como `(TAG) nome`. Decisão delegada pelo PO ao time técnico em 2026-10-13 (plan/specs/names.md) | Tech Lead |
| D-21 | Moderação no chat | Como o original (classes do `auth.txt`, ban por IP no arquivo) / admin da plataforma e auditoria na API | ✅ **Decidido no OG-046 (divergência intencional):** chat, anti-flood e comandos como `Server::chat`; admin = flag do ticket; `/set` só nas regras de jogo e nunca em preset travado; motivo opcional em `/kick` e `/ban`; ban da sala por conta e IP gravado na API (bloqueia novos tickets); toda ação auditada em `admin_actions`; `/bot` fica para o OG-048; filtro de palavras opcional por sala. Decisão delegada pelo PO ao time técnico em 2026-10-13 (plan/specs/chat-moderacao.md) | Tech Lead |
| D-22 | Queda de conexão | Como o original (sai na hora) / vaga guardada por 15 s | ✅ **Decidido no OG-047 (divergência intencional):** idle kick igual ao original; quem cai fica parado no mundo por 15 s e volta à mesma vaga (time, frags, estatísticas) com um token de retomada (convidado) ou pela conta; o cliente reconecta sozinho por até 14 s. Protocolo ganha `resumeToken`/`resume` (versão 2). Decisão delegada pelo PO ao time técnico em 2026-10-13 (plan/specs/inatividade-reconexao.md) | Tech Lead |
| D-23 | Provedor de e-mail transacional | Resend / Brevo / Mailjet / SMTP2GO / Amazon SES | ✅ **Decidido pelo PO em 2026-10-13: Resend, no plano gratuito** (volume baixo: só recuperação de senha de uma comunidade pequena). Já implementado (`MAILER=resend`, `RESEND_API_KEY`, `MAIL_FROM`); falta, no deploy, criar a conta e verificar um domínio próprio (registros DNS) para os e-mails não caírem em spam. Desenvolvimento segue com Mailpit | PO |
| D-24 | Registro de salas e matchmaking | Master server do original (lista em HTTP, servidor escolhido pelo jogador) / registro no Redis / registro no PostgreSQL | ✅ **Decidido no OG-086 (divergência intencional, técnica):** os game servers mandam heartbeat a cada 3 s à API, que guarda servidores e salas no **PostgreSQL** (`game_servers`, `rooms`); sala ou servidor sem heartbeat por 10 s sai do lobby. Redis não é necessário nesta escala (dezenas de servidores × 1 escrita/3 s) e continua opcional para contadores. A API não chama os servidores: a sala fora do ar é aberta pelo próprio ticket (claim `spawn`, assinada) no servidor da sala ou no menos carregado (região pedida primeiro). Salas privadas são só Casual, exigem conta e são apagadas após 1 h fora do ar. | Agente |
| D-25 | Cálculo e aplicação do ranking | Como o original (master soma para sempre; servidor com id/senha de ranking; humanos = IPs distintos) / por temporada na API | ✅ **Decidido no OG-084 (divergência intencional, técnica):** o game server calcula os deltas como o original (`score_frag`/`score_neg`, modificador [1/3, 3], truncamento) só em sala **Ranked** com os mínimos (humanos distintos = **contas** distintas); a força de cada jogador é a da **temporada ativa**, que vem no ticket junto da participação (opt-out em `PUT /account/ranking`, vale na próxima entrada). A API soma os deltas por temporada, idempotente (`/internal/matches` por partida, `/internal/rating-deltas` por envio); leaderboard no PostgreSQL. Nova temporada: `cli.js season start NOME`. Spec `plan/specs/ranking.md`. **Substituída pelas D-65/D-66 (2026-10-22).** | Agente |
| D-26 | Nomes dos jogadores na tela | Como o original (`Show player names` = never no código e no `client.cfg`; Ctrl+F3 alterna) / mostrar na mesma sala | ✅ **Decidido no OG-068 (divergência intencional):** padrão web "in same room", para identificar com quem se joga numa sala pública; a opção tem as três escolhas do original. Demais padrões seguem o `client.cfg` distribuído (D-05), inclusive mensagens de morte ligadas. Spec `plan/specs/opcoes-jogador.md`. | Agente |
| D-27 | Bots em sala sem humanos | Como o original (`bots_fill`/`min_bots` valem mesmo sem ninguém) / sem humanos, nenhum bot | ✅ **Decidido no OG-054 (divergência intencional):** sem humanos a sala fica sem bots — bots sozinhos gastam CPU e manteriam a sala viva para sempre no registro (OG-086). Também: `CASUAL_BOTS_FILL` no game server (padrão 0, como o `gamemod.txt`) e `/bot` liberado ao dono de sala Casual. Decisão delegada pelo PO ao time técnico em 2026-10-13 (plan/specs/bots-populacao.md) | Tech Lead |
| D-28 | Replays | Como o original (só com `recording` > 0, arquivo binário do servidor) / sempre que houver destino, formato web | ✅ **Decidido no OG-090 (divergência intencional):** formato próprio versionado (`OGWR`, protocolo web + gzip), gravação de toda partida com destino configurado (`recording` = mínimo de humanos, ≥ 1), arquivos no game server com retenção de 30 dias e URL guardada na API; object storage no OG-103. Decisão delegada pelo PO ao time técnico em 2026-10-13 (plan/specs/replays.md) | Tech Lead |
| D-29 | Dados de navegação dos bots | Cópia do AreaMap por bot com distâncias dentro das áreas (original) / AreaMap imutável compartilhado e tabelas de distância por bot | ✅ **Decidido no OG-050 (divergência interna, sem efeito no jogo):** pacote puro `@outgun/bots`; AreaMap montado uma vez por mapa (cache por CRC e título, como `BotSharedDataStorage`) e tabelas `Int32Array` por bot; resultados idênticos ao original (plan/specs/bots-areamap.md). Decisão delegada pelo PO ao time técnico | Tech Lead |
| D-30 | Limiar de mira dos bots | `static` calculado na primeira mira do processo (original) / constante | ✅ **Decidido no OG-052 (divergência intencional, sem efeito prático):** `1,3 × PLAYER_RADIUS` = 19,5, o valor que o original usa sempre que a primeira mira do processo é com a arma 1 (início de partida); confirmado com o oráculo (plan/specs/bots-ia.md). Decisão delegada pelo PO ao time técnico | Tech Lead |
| D-31 | Bots no servidor web | Uma thread com todos os bots e o `rand()` global (original) / cliente virtual por bot no laço da sala, sorteio próprio | ✅ **Decidido no OG-053 (divergência interna):** cada bot é um `BotClient` que recebe os mesmos bytes de um humano com o atraso de `bot_ping`, decodifica com o `ClientSession` do netcode e devolve `input`/`fire` à sala no fim do frame; os bots de uma sala sorteiam num `GlibcRand` próprio (no original dividem o `rand()` com o servidor), para não mudar a sequência do mundo. Modo `botTest` (como o `-bottest`) para medir sem humanos. Decisão delegada pelo PO ao time técnico | Tech Lead |
| D-32 | Observabilidade sem fornecedor fixo | SDK oficial do Sentry (`@sentry/node`, `@sentry/browser`) / métricas e logs próprios + envio de erros pelo protocolo de envelope do Sentry | ✅ **Decidido no OG-102 (delegada):** métricas no formato do Prometheus num registro próprio (`packages/observability`, sem alocação no caminho do tick), logs JSON com pino (`service`, `env`, `reqId`, `room`, `jti` do ticket para ligar a API ao game server) e erros enviados por `fetch` no formato de envelope do Sentry, aceito por Sentry e GlitchTip. O SDK oficial instrumentaria o uWebSockets.js e somaria peso ao cliente; o envelope é estável e documentado. Tudo desligado sem `SENTRY_DSN`/`VITE_SENTRY_DSN`; painel e alertas em Prometheus + Grafana + Alertmanager (`tools/observability/`). Qual serviço de erros e para onde vão os alertas fica para o deploy (OG-103) | Tech Lead |
| D-33 | Ban por dispositivo (RN-PLT-05) | Fingerprint do navegador / id aleatório guardado no navegador | ✅ **Decidido no OG-104 (delegada):** id aleatório de 144 bits em `localStorage` (`outgun.device`), mandado só ao pedir entrada numa sala; a API usa e guarda apenas o SHA-256 truncado (32 hex) — nos bans e no ticket (`dev`) — nunca o id cru. Fingerprint seria mais difícil de trocar, mas é rastreamento sem consentimento (LGPD) e frágil; limpar os dados do site troca o id, por isso o ban continua também por conta e IP. A política de privacidade (OG-105) deve citar o id | Tech Lead |
| D-34 | Painel admin × game servers | API chama cada game server (porta de controle) / comandos e configuração na resposta do heartbeat | ✅ **Decidido no OG-087 (delegada):** o painel grava o comando (`admin_commands`) e a auditoria na API; o game server recebe na resposta do heartbeat (≤ 3 s), executa pelas mesmas ações do console e confirma no heartbeat seguinte (o ban é criado com a conta, IP e dispositivo que só o game server conhece). Nenhuma porta de entrada nova nos game servers e funciona com várias máquinas por região. Presets: os do jogo (inclusive o Ranked travado) só mudam com uma versão nova — no painel são só leitura; o painel cria presets Casual versionados (histórico em `casual_preset_versions`), validados (só regras de jogo/saúde/power-ups/física/bots). Rotações por modo valem nas salas da plataforma a partir da próxima troca de mapa. Papéis: moderador (salas, denúncias, bans de sala, auditoria) e admin (tudo + mensagem geral, bans de plataforma, presets, rotações, papéis) | Tech Lead |
| D-35 | **v2** — Fonte única da interface (OG-200) | Inter / Manrope / Space Grotesk / Barlow | ✅ **Decidido em 2026-10-14 (delegada pelo PO):** **Inter** — moderna, simples, a mais legível em tamanhos pequenos e tabelas (algarismos tabulares), acentos completos, OFL | Tech Lead |
| D-36 | **v2** — Site público / portal | App separado / junto do servidor do jogo | ✅ **Decidido pelo PO em 2026-10-14:** sem portal por ora (OG-210 e OG-216 cancelados). Perfil social e relatórios ficam no cliente atual, servidos junto do servidor do jogo; um site público, quando fizer sentido, será um repositório dedicado | PO |
| D-37 | **v2** — Música fora do Casual | Só Casual / também Ranked / espectador e replay | ✅ **Decidido pelo PO em 2026-10-14:** Casual e espectador ao vivo com música; Ranked e replay sem. **Revisto em 2026-10-21 (pedido da comunidade, OG-334):** o Ranked também toca a playlist das partidas; replay segue sem. Quem não quiser desliga nas Opções (RN-MUS-04) | PO |
| D-38 | **v2** — Autoria e crédito da trilha sonora | — | ✅ **Decidido pelo PO em 2026-10-14:** faixas geradas no Suno pelo próprio PO; crédito "Música: Thiago Vasconcellos" (PO, 2026-10-20: passa a "Música: Thiago Anuszkiewicz", o mesmo autor com o sobrenome polonês, igual à tag de artista dos MP3); metadados do Suno removidos dos arquivos. Licença das faixas (PO, 2026-10-14): **CC BY-SA 4.0** | PO |
| D-39 | **v2** — Visibilidade do perfil social | Público / público com opção de esconder / só com conta | ✅ **Decidido pelo PO em 2026-10-14:** público, com opções na conta para esconder companheiros/rivais e histórico de partidas (OG-211) | PO |
| D-40 | **v2** — Quando a partida Ranked começa | Mínimo de 6 jogadores em qualquer formato / sala completa do formato (6, 8 ou 10) | ✅ **Decidido pelo PO em 2026-10-15:** só com a sala completa do formato — um 3x3 não começa sem os 6 jogadores | PO |
| D-41 | **v2** — Séries md3/md5 | — | ✅ **Decidido pelo PO em 2026-10-15:** séries são só facilitadoras — cada jogo é uma ranqueada normal (ranking por jogo, voto de mapa normal, lados podem mudar no lobby). Fim de md1 → todos voltam ao menu inicial; fim de um jogo de md3/md5 que não encerra a série → todos voltam direto ao lobby da sala; fim da série → menu inicial | PO |
| D-42 | **v2** — Ranking por formato | — | ✅ **Decidido pelo PO em 2026-10-15:** rating separado por formato (3x3, 4x4, 5x5), e o rating geral é calculado a partir deles: score e neg gerais = soma dos três formatos, `rating = (score+1)/(neg+1)` (RN-RNK) **Substituída pelas D-65/D-66 (2026-10-22).** | PO |
| D-43 | **v2** — Abandono e inatividade no Ranked | — | ✅ **Decidido pelo PO em 2026-10-15:** queda no meio do jogo segue a D-46; entre jogos da série a vaga reabre no lobby (bot substituto não passa para o jogo seguinte); quem não marca "Pronto" em 60 s após o voto sai da sala | PO |
| D-44 | **v2** — Salas Ranked com senha | — | ✅ **Pedido do PO em 2026-10-15:** qualquer conta cria sala Ranked, com senha opcional; o preset continua travado (revisa RN-MOD-04 e RN-CFG-03) | PO |
| D-45 | **v2** — Pausa tática no Ranked | — | ✅ **Decidido pelo PO em 2026-10-15:** 60 s por time **por jogo** (não por série), em até 3 pedidos; retomada sempre com contagem de **3 s**; só o time que pediu retoma antes — o adversário não controla a pausa | PO |
| D-46 | **v2** — Queda no Ranked e bot substituto (revisa D-11) | — | ✅ **Decidido pelo PO em 2026-10-15:** queda pausa o jogo; prazo de reconexão de **120 s**; depois, voto só do time desfalcado (maioria, 20 s, empate = bot) entre um a menos e bot; até 2 bots por partida; quem volta retoma a vaga e o bot sai; a partida conta para o ranking, com a marca. O bot se chama **`BOT-<nome do jogador>`** (ex.: `BOT-ozzylords`) e tem o nível calculado pelo histórico Ranked do jogador substituído; sem histórico, nível intermediário (OG-266) | PO |
| D-47 | **v2** — Clãs da comunidade (substitui a clan tag livre) | — | ✅ **Decidido pelo PO em 2026-10-15:** criar/entrar/gerir clãs; tag única de até 2 caracteres (**até 3 desde a 2.49.1, em 2026-10-27**: `MAX_CLAN_TAG_LENGTH`); tags livres atuais apagadas na migração; tag e nome únicos sem diferença de maiúsculas e acentos; líder que sai passa a liderança ao admin mais antigo (senão ao membro mais antigo), último que sai dissolve o clã; limite de 30 membros; carência de 7 dias para entrar em outro clã depois de sair; ranking de clãs por pontos em clã x clã na temporada (vitória 3, empate 1, desempate por saldo de capturas, mínimo de 3 partidas) | PO |
| D-48 | **v2** — Temporadas mensais e hall da fama | — | ✅ **Decidido pelo PO em 2026-10-15:** temporada reinicia todo mês, no dia 1 às 00:00 (Brasília), e existe ranking geral de todas as temporadas; hall da fama com os 3 primeiros de cada temporada no geral, por formato e de clãs **Substituída pelas D-65/D-66 (2026-10-22).** | PO |
| D-49 | **v2** — Carência de clã não vale para criar clã | — | ✅ **Decidido pelo PO em 2026-10-15:** a carência de 7 dias (D-47) só impede **entrar** em outro clã; quem saiu pode **criar** um clã novo na hora. Dissolução continua sem gerar carência | PO |
| D-50 | **v2** — Celular fora do escopo por ora (substituída pela D-80 em 2026-10-25) | — | ✅ **Decidido pelo PO em 2026-10-15:** o celular mostra só "não disponível para celular" (OG-209); telas e jogo não são mais validados em mobile, para não travar features de desktop | PO |
| D-51 | **v2** — Bots da sala Casual configurados pelo cliente | — | ✅ **Decidido pelo PO em 2026-10-15:** quantidade de bots e nível (1–5 ou variável, cada bot com um nível) ficam nas opções do cliente; valem ao criar sala privada e, numa sala já rodando, a partir da próxima partida (reinício ou troca de mapa), com opção de reiniciar na hora. Só o dono da sala privada e admins aplicam; salas públicas oficiais seguem o preset do servidor (OG-289) | PO |
| D-52 | **v2** — Modo Carnificina | — | ✅ **Pedido do PO em 2026-10-15:** preset Casual "Carnificina" com o máximo de power-ups (32, o teto do jogo) reaparecendo na hora, queda de item na morte e duração longa (90 s por item, até 5 min), também ligado no meio da partida com `/carnage on|off` (dono e admins). Mudança na simulação: quando as regras de power-up mudam no meio da partida, os itens que faltam são agendados na hora e quem já espera não espera mais que o tempo novo (no original, só depois da próxima coleta). O teto de 32 continua (OG-290) | PO |
| D-53 | **v2** — Tema dos menus | — | ✅ **Decidido pelo PO em 2026-10-15:** os menus fora da partida ganham a cara do tema padrão da partida (chão e paredes verdes, mastro amarelo, times vermelho e azul). Entre as duas direções do protótipo (`plan/specs/menus-tema/`), vale a **Campo** (OG-291); a **Placar** fica guardada para um tema futuro de menu (OG-292; na S24 virou opção em Opções › Gráficos › Menus, com Campo como padrão). Temas legados (Metal, Grid, Grass...) não servem de referência. Nada dentro da partida muda (RN-UI-05) | PO |
| D-54 | **v2** — HUD da partida por resolução | — | ✅ **Decidido pelo PO em 2026-10-16:** o HUD deixa de ter texto fixo em pixels e ganha uma escala pela altura da tela (passos de 0,5), com chat na largura toda da faixa de cima, minimapa começando na linha da área de jogo e placar de borda a borda na coluna da direita; em telas largas (≥ 3:2) o chat vai para o alto da coluna e os times ficam lado a lado. A área de jogo segue mostrando uma sala. Protótipo: `plan/specs/hud-resolucoes/`. Exceção aprovada à RN-UI-05 para os cards OG-293 a OG-296 (RN-UI-06) | PO |
| D-55 | **v2** — Estilos do HUD da partida | — | ✅ **Decidido pelo PO em 2026-10-16:** três estilos em Opções › Gráficos: **Clássico** (o HUD da S25, padrão), **Moderno** (opção A do protótipo `plan/specs/hud-moderno/`: sala com a altura toda à esquerda, coluna com placar dos times e relógio, minimapa, vida, energia, power-ups, arma e chat; frags só no TAB) e **Personalizado** (editor de posição, tamanho e visibilidade, começando do Moderno). A opção B (painéis sobre a sala) foi descartada: informação sobre o mapa cria pontos cegos. Por isso nenhum componente fica sobre a sala, nem no Personalizado. O layout personalizado vai na conta com as outras preferências (sem migration: é mais um campo das configurações) Em 2026-10-16 o PO decidiu que o **Clássico continua o padrão** e pediu a opção de deixar os frags só no TAB também no Clássico, desligada por padrão (OG-302) | PO |
| D-56 | **v2** — Atraso do espectador ao vivo | — | ✅ **Decidido pelo PO em 2026-10-20:** o `spectating_delay` padrão passa de 120 s (original) para **30 s** em todos os presets, porque 2 minutos é demais para um jogo tão rápido; o atraso continua para ninguém passar posições a um time assistindo ao vivo. `/set spectating_delay` segue valendo (OG-318) | PO |
| D-57 | **v2** — Espectador em salas com senha | — | ✅ **Decidido pelo PO em 2026-10-20:** salas com senha também podem ser assistidas (revoga a divergência do OG-092 de 2026-10-14); a senha protege só a entrada como jogador. Toda sala, Casual ou Ranked, tem botão "Assistir" (OG-319, OG-320) | PO |
| D-58 | **v2** — Jogo no computador | — | ✅ **Decidido pelo PO em 2026-10-20:** além da web, o jogador pode instalar o Outgun pelo navegador (PWA) ou baixar um `.exe` (Electron). O cliente desktop é só uma janela que carrega o site: a versão é sempre a mesma da web, sem instalador novo a cada deploy. Sem assinatura digital por ora; o instalador fica no servidor do beta, porque o repositório é privado (OG-323, OG-324, OG-325). _Nota de 2026-10-26: o repositório passou a ser público._ | PO |
| D-59 | **v2** — Outgun na Steam | — | ✅ **Decidido pelo PO em 2026-10-20:** o cliente Electron substitui o jogo antigo no app 663760 da Steam, com depots para Windows (663761), macOS (663762) e Linux (663763). Cada envio vai para a branch `beta` (com senha); só o PO promove para a `default` no Steamworks, e o build antigo (5426019) fica como volta atrás (OG-328) | PO |
| D-60 | **v2** — Anti-flood do chat | Limiar do original / só flood extremo | ✅ **Decidido pelo PO em 2026-10-21:** só rajadas extremas contam como flood (30–40 mensagens em poucos segundos); o bloqueio sempre acaba. Revê a RN-CHT-02 (OG-335) | PO |
| D-61 | **v2** — Duração do Ranked | Só limite de capturas / 20 min + prorrogação | ✅ **Decidido pelo PO em 2026-10-21:** 20 min fixos; empate → +5 min sem morte súbita (até 8 capturas ou 25 min); empate aos 25 é empate. RN-RKL-25 (OG-341) | PO |
| D-62 | **v2** — Ranked sem humanos de um lado | Seguir com bots / cancelar | ✅ **Decidido pelo PO em 2026-10-21:** cancelar quando todos caem ou quando um time inteiro cai, descartando rating e estatísticas; jogo da série disputado de novo. RN-RKL-26 (OG-345) | PO |
| D-63 | **v2** — Fim de partida | Placar sobre o mapa / modal | ✅ **Decidido pelo PO em 2026-10-21:** modal com resultado e detalhes, fecha pelo jogador ou em 10 s e segue o destino (lobby da série, menu ou próximo mapa); intervalo do Casual vai a 10 s (OG-344) | PO |
| D-64 | **v2** — Teclas do voto do substituto | 1 e 2 / Ctrl+1 e Ctrl+2 | ✅ **Decidido pelo PO em 2026-10-21:** Ctrl+1/Ctrl+2 no esquema Clássico e botões clicáveis no aviso (o navegador comum usa Ctrl+número para abas); 1 e 2 ficam para o chat (OG-348) | PO |
| D-65 | **v2** — Rating de habilidade | score/neg (D-02) / Glicko-2 / OpenSkill | ✅ **Decidido pelo PO com a comunidade em 2026-10-22:** OpenSkill Plackett–Luce **puro**, parâmetros padrão; um rating **único** (todos os formatos) e **permanente**; sem decaimento por tempo e sem inflar σ por temporada; começa **do zero** na implantação (sem reprocessar o histórico); sem opção de não participar (quem não quer joga Casual); aparece no perfil e será a base do balanceamento (adiado, OG-357). Exibido como `max(0, (μ − 3σ) × 100)`, "em calibração" nas 10 primeiras. Proposta: https://claude.ai/artifact/CKBe4QGjaDSyspswaE3GQN. RN-SKL (OG-349) | PO |
| D-66 | **v2** — Ranking por score/neg, temporadas e hall da fama | Manter / substituir | ✅ **Decidido pelo PO em 2026-10-22:** o ranking por score/neg é **descontinuado** (dados guardados, só leitura); outubro/2026 é a última temporada dele. As temporadas mensais passam a ser um **leaderboard de atributos** individuais (estilo HLTV) que reinicia todo mês, para manter a competição acessível a novos jogadores; o hall da fama segue mensal, pelos 3 primeiros de cada stat principal. Ranking de clãs não muda. RN-LDB (OG-350 a OG-354) | PO |
| D-67 | **v2** — Lista geral do mês | Rating OpenSkill / índice por percentis / quadro de medalhas | ✅ **Decidido pelo PO em 2026-10-22:** índice de 0 a 100 = soma de peso × percentil nos 6 stats principais; pesos sugeridos para um CTF (objetivo 60%, combate 40%): capturas 25%, abates 20%, devoluções 20%, tempo com bandeira 15%, K/D 10%, precisão 10%; selo de melhor do mês no hall da fama. RN-LDB-06 (OG-358) | PO |
| D-68 | **v2** — Contadores novos na sim (OG-355) | — | ✅ **Decidido no OG-355 (2026-10-22), a partir do pedido do PO por stats de mais estilos de jogo:** `PlayerStats`/`PlayerResult` ganham `effectiveDamage` (soma de `min(dano, vida antes do acerto)` em inimigos; dano no shield não conta), `killsEnemyBase`/`killsOwnBase`/`killsMidfield` (sala da vítima; base = sala onde nasce uma bandeira do time; base inimiga tem precedência) e `defenses` (abate com bônus de defesa de portador ou de bandeira própria, uma vez por abate; o bônus de ataque não conta). Só contadores: frags, pontuação e física não mudam. Abates em bots entram nas zonas (o `botKills` é só o total). | Dev |
| D-69 | **v2** — Rotação do painel nas salas Casual | Escolha livre / só da rotação / sempre a rotação | ✅ **Decidido pelo PO em 2026-10-22:** a rotação do painel é sempre respeitada: a sala privada escolhe mapas só entre os da rotação Casual (sem escolha = rotação inteira) e as salas abertas seguem a rotação nova na próxima troca de mapa. Sem rotação no painel, vale a do servidor e a escolha livre. Revisa RN-CFG-03. | PO |
| D-70 | **v2** — Mapas da comunidade e permissões da moderação | Só por versão nova / moderador envia e admin aprova / moderador publica direto | ✅ **Decidido pelo PO em 2026-10-22:** moderadores enviam mapas .txt (formato do original) pelo painel e publicam direto, com validação pelo parser e auditoria; moderadores também criam/editam presets Casual e rotações (antes só admin). | PO |
| D-71 | **v2** — Envio dos controles | 10 Hz com um reenvio por frame (como o original) / toda mudança enviada na hora, com sequência própria | ✅ **Decidido pelo PO em 2026-10-22 (S39, OG-370, OG-371):** toda mudança de controle que ainda pega o tick vai ao servidor na hora (sem o limite de um reenvio por frame); a predição usa o controle atual no quadro seguinte. Sem mudar o protocolo (dispensou o número de sequência, ver OG-370). A física não muda. | PO |
| D-72 | **v2** — Teclas "quase simultâneas" (diagonal, Alt) | Como chegarem / janela de acorde no cliente | ✅ **Decidido pelo PO em 2026-10-22 (S39, OG-372):** janela de 30 ms (opção 0–60 ms) em que a arma não vira; o movimento não espera (strafe provisório); vale também para o direcional digital do gamepad. Sem equivalente no original. | PO |
| D-73 | **v2** — VSync no cliente desktop | Sempre preso ao monitor / opção para desligar | ✅ **Decidido pelo PO em 2026-10-22 (S39, OG-373):** opção "Sincronia vertical" no desktop, aplicada ao reabrir; **padrão desligada** (PO, 2026-10-22: menos atraso na tela para o público competitivo), com limite automático de 240 FPS e "sem limite" explícito; no navegador o limite é a taxa do monitor. **Revisto em 2026-10-23 (OG-400):** "liberar geral": sem opção de VSync no desktop, FPS sempre livre e limite nunca abaixo de 240. | PO |
| D-74 | **v2** — Taxa do servidor acima de 10 Hz | Manter 10 Hz / 20 Hz em meio passo / input no subpasso | ✅ **Decidido pelo PO em 2026-10-22:** a física **não muda**: todas as salas (Casual, Ranqueado, persistentes) seguem a 10 Hz, como hoje ("o jogo está muito bom e cheio de elogios"). No máximo, uma opção de **criar sala privada a 20 Hz**, desligada por padrão e sem efeito em nenhuma outra sala (OG-387, Backlog). Medições no OG-375. | PO |
| D-75 | **v2** — Registro de eventos no Casual | Só ranqueadas (OG-362) / também Casual | ✅ **Decidido pelo PO em 2026-10-22 (OG-381, 2.39.1):** os eventos são gravados também no Casual e aparecem no relatório; leaderboard, hall da fama e "quem matou quem" do perfil seguem só com ranqueadas. | PO |
| D-76 | **v2** — Idiomas do jogo | Manter os 4 do original / só pt-BR e inglês | ✅ **Decidido pelo PO em 2026-10-22:** finlandês e italiano saem (OG-384): legado para uma parcela mínima da comunidade de 20 anos atrás, sem os textos novos da v2. Preferência antiga cai no idioma do navegador. | PO |
| D-77 | **v2** — Como as conquistas chegam à Steam | Espelho pelo app desktop (`steamworks.js`, conquista = marco da conta) / Web API do servidor (vincular SteamID, chave de publisher) | ✅ **Decidido pelo PO em 2026-10-23:** espelho pelo app (OG-396): sem vínculo de SteamID nem chave no servidor e retroativo de graça; uma conta Steam que use duas contas do Outgun soma as conquistas das duas. | PO |
| D-78 | **v2** — Quando o lado da partida vira o clã | Só com o lado inteiro do clã / com 2 humanos do clã, sem outro clã no lado | ✅ **Decidido pelo PO em 2026-10-23 (S43):** bots e humanos sem clã não contam; ≥ 2 humanos do mesmo clã num lado e nenhum humano de outro clã, e o lado vira o clã (tag e cor). Ex.: 3x3 com 2 do DK + 1 sem clã de um lado e 2 do DT + 1 bot do outro: DK x DT. Dois clãs no mesmo lado: cor padrão. Casual: decidido no início de cada rodada (e enquanto a sala enche: 0 x 0 nos primeiros 30 s) e fixo até ela acabar; mudanças no meio valem na próxima. Ranked: decidido no lobby, com os lados já montados, e fixo o jogo todo (queda e bot substituto não desfazem). Ajustado pelo PO em 2026-10-23. Cor: primária; parecida com a do outro lado → secundária; as duas → cor padrão. Casual e Ranked. | PO |
| D-79 | **v2** — Números de jogador e medalhas | — | ✅ **Decidido pelo PO em 2026-10-23 (S43):** números únicos de 2 a 99, liberados depois de 60 dias sem jogar (a espera de 30 dias entre trocas foi desligada pelo PO em 2026-10-24, OG-415: `NUMBER_COOLDOWN_DAYS`); o 1 é do líder do "Melhor do mês" (índice geral) do mês anterior e o uso é opcional; dourado, prateado e bronze para o top 3 desse índice no mês seguinte; paleta pessoal de 32 cores (sem cor livre). | PO |
| D-80 | **v2** — Celular de volta, sem a partida (substitui a D-50) | Só aviso (D-50) / portal no celular / jogo inteiro no celular | ✅ **Decidido pelo PO em 2026-10-25 (S45):** o celular abre as telas do portal (início, conta, perfil, clãs, ranking, hall da fama, jogadores, relatórios de partida e série com PDF, e as abas de moderação: salas, denúncias, clãs, bans, auditoria e feedback). A partida, o espectador, os replays, criar/entrar em sala, opções, controles e as abas pesadas do painel (mapas, presets, rotações, bots, papéis, convites, rede) seguem só no computador, com aviso. Como levar o jogo ao celular fica em aberto. PDF do relatório gerado no cliente, em A4. | PO |
| D-81 | **v2** — Troca de sala parada ou voltando no eixo (OG-428) | Dividir pela velocidade como o original / tempo zero quando a velocidade não leva para fora | ✅ **Decidido pelo agente em 2026-10-26 (S46), na correção da issue #6:** fora da sala com velocidade zero (ou voltando) no eixo, a troca de sala não devolve tempo; antes a divisão por zero virava NaN e o laço da física não terminava. Os laços da física também param com NaN. Casos normais (saindo em movimento) ficam idênticos. | Agente |
| D-82 | **v2** — Regras do convite pela Steam no Ranked (OG-450) | Convidado entra no lado livre normal / entra no time de quem convidou / convite só até o "Pronto" de todos | ✅ **Decidido pelo PO em 2026-10-27:** o convidado entra no time de quem convidou; depois que todos marcam "Pronto" o convite fica inválido; em clã x clã qualquer um pode ser convidado (não precisa ser do clã). | PO |
| D-83 | **v2** — Expulsão por inatividade com poucos humanos (OG-459, issue #14) | Contar bots para o limite / baixar o limite para 2 humanos / manter | ✅ **Decidido pelo PO em 2026-10-28:** manter como está: o idle kick (120 s) só age com 4 humanos ou mais na sala (`idlekick_playerlimit`). OG-459 cancelado | PO |
| D-84 | **v2** — Radar de estilo de jogo (OG-469 a OG-479) | Eixos, partidas que contam, base do percentil, janela, radar de clã, arquétipos | ✅ **Decidido pelo PO em 2026-10-28, após discussão com a comunidade:** os 6 eixos propostos; só ranqueadas; percentil contra todos os ativos da temporada; temporada atual com "sempre" como opção; radar de clã sempre pela mediana dos membros (na prévia clã x clã, de quem joga, para não ficar desproporcional); arquétipos Atirador, Corredor, Muralha, Suporte, Sobrevivente e Coringa; todos os itens na mesma sprint. RN-RAD-01 a 05 | PO |
| D-85 | **v2** — Emblema do clã (OG-480 a OG-489) | Famílias fixas da prancha / emblema montado; quem troca; unicidade; onde na partida; entrega | ✅ **Decidido pelo PO em 2026-10-28, após discussão com a comunidade** (proposta: https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`): emblema montado (moldura + símbolo + cores do clã, desenho vetorial, listas fechadas, sem upload); líder e admins escolhem e trocam; cada combinação é única entre os clãs; na partida, chão da base e fim de rodada/partida, **não na bandeira** (pode confundir); portal e partida na mesma sprint; molduras especiais pelo hall da fama de clãs; catálogo com 14 símbolos pedidos pela comunidade além dos 14 rascunhos; imagem do confronto e PNG "se custar pouco" (Could). RN-EMB-01 a 05 | PO |
| D-86 | **v2** — Modos de treino (OG-490 a OG-500) | Quadrado da base; quantidades; sucesso da Defesa, Fuga e Captura; convidados; power-ups; contagem; ideias extras | ✅ **Decidido pelo PO em 2026-10-28, após discussão com a comunidade** (proposta: https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`): presets Treino (Ataque, Defesa, Fuga, Captura) na sala privada Casual, jogador × bots, tentativa que reinicia sozinha. P1: depende do modo; no Ataque e na Defesa o que vale é o portador sair do quadrado da base. P2: Ataque com 1 a 4 defensores. P3: Defesa termina em sucesso quando todos os atacantes caem, e eles atacam ao mesmo tempo. P4: Fuga da base inimiga até a sua. P5: Captura termina em sucesso ao devolver a bandeira. P6: cenários diversos dentro do modo. P7: dá para convidar outros jogadores, que escolhem treinar do mesmo lado ou do lado oposto. P8: power-ups desligados por padrão. P9: treino não conta para nada. P10: dificuldade que sobe sozinha e início variado. RN-TRN-01 a 07 | PO |

---

## 13. Glossário
| Termo | Significado |
|---|---|
| Frame | Passo da simulação, 0,1 s |
| Sala (room/screen) | Célula de 472×354 px; a tela mostra uma sala |
| Frag | Ponto individual |
| Neg | Ponto negativo (usado no ranking) |
| Pup | Power-up |
| Deathbringer (DB) | Power-up que explode ao morrer, atordoando inimigos |
| Bandeira selvagem/verde | Bandeira do time 2, capturável por ambos conforme config |
| gamemod | Arquivo de configuração do servidor original |
| AOI | Area of interest: o que cada cliente pode receber |
| Golden trace | Registro do estado frame a frame produzido pelo original, usado como referência |
| TSIZE | Metade de `maxplayers`; no original, `pid / TSIZE` = time |

---

## 14. Mapa do código-fonte original
| Assunto | Onde olhar |
|---|---|
| Constantes globais | `src/commont.h:280-320` |
| Classes do mundo | `src/world.h` (Map 205, Statistics 266, GunDirection 387, PlayerBase 422, Flag 640, Powerup 780, Deathbringer 809, PhysicalSettings 832, WorldBase 892, WorldSettings 1033) |
| Parser de mapa | `src/world.cpp:375-775` |
| Colisão com paredes | `src/world.cpp:120-375, 1069-1210` |
| Aceleração | `src/world.cpp:1209` |
| Foguetes | `src/world.cpp:1342-1410, 2402-2460, 2510` |
| Respawn | `src/world.cpp:1807-1915, 2228` |
| Power-ups | `src/world.cpp:1928-2215` |
| Dano/morte | `src/world.cpp:2228-2400` |
| Colisão entre jogadores | `src/world.cpp:2545-2735` |
| Loop de física por sala | `src/world.cpp:2740-3070` |
| Pré/pós-física do jogador | `src/world.cpp:3087-3365` |
| Captura | `src/world.cpp:3367-3445, 3639-3700` |
| Frame do servidor | `src/world.cpp:3447-3615` |
| Predição do cliente | `src/world.cpp:3697-3750`, `src/clientbase.cpp:420-560` |
| Estatísticas | `src/world.cpp:3752-3910, 4069-4211` |
| Pontuação/ranking | `src/server.cpp:450-515`, `src/servnet.cpp:924-960, 1700-1770, 2400-2430` |
| Rotação/votação | `src/server.cpp:565-790` |
| Times | `src/server.cpp:216-390`, `src/servnet.cpp:1333-1420` |
| Chat/comandos | `src/server.cpp:1188-1530` |
| Idle kick | `src/server.cpp:1640-1660` |
| Registro de settings | `src/server_settings.cpp` |
| Mensagens de rede | `src/protocol.h`, `src/servnet.cpp`, `src/clientbase.cpp` |
| Frame por cliente | `src/servnet.cpp:1937-2345` |
| Bots | `src/robot.cpp`, `src/bot_support.cpp` |
| Gerador de mapas | `src/mapgen.cpp`, `src/tools/mapgen-main.cpp`, `mapgen/` |
| Render | `src/graphics.cpp` (`draw_player`, `draw_rocket`, `draw_pup`, efeitos) |
| Menus | `src/client_menus.*`, `src/menu.*` |
| Docs do usuário | `doc/*.html` (game, gamemod, maps, map-tutorial, admin, menus) |

---

## 15. v2 — o jogo segue seu próprio caminho

Em 2026-10-14 o port ficou completo (S0–S12) e o beta com veteranos está no ar para levantar melhorias de física e de conceitos do jogo. A partir daqui:

- **Fidelidade ao original deixa de ser requisito.** O Outgun 1.0.3 em `_legacy/` continua como referência histórica e fonte de assets; mudanças de regra e física são decisões novas (D-NN), não divergências a justificar.
- **Skills:** `outgun-re-spec` e `outgun-parity-harness` desativadas; `outgun-card-workflow` revisada; `outgun-asset-pipeline` mantida. O job de paridade do CI continua enquanto a sim não mudar e sai no OG-230.
- **Branches e tags:** `main` em `v1.0.0` é o port concluído (beta). A v2 é desenvolvida na branch `v2`: branches de card saem dela e voltam para ela; cada sprint aprovada sobe a versão do jogo (número do meio = sprint: S19 = `2.19.0`; correção fora de sprint sobe o último) com `node tools/dev/version.mjs X.Y.Z`, que grava a mesma versão em todos os `package.json` (o `pnpm verify` confere), e ganha a tag `vX.Y.Z`. As tags `v2.0.0-s13` a `v2.0.0-s18` são do esquema antigo. Correções do beta da v1 vão na `main` e são trazidas para a `v2`.
- **Repositório público (desde 2026-10-26):** `thiagovasconcellos/outgun-web`. Bugs chegam por issue (formulário do GitHub) ou pelo formulário do site, que o moderador transforma em issue (OG-429, OG-430); `tools/dev/issues.mjs` transforma as issues em cards e as fecha com a versão na aprovação da sprint (OG-432).
- **Testes:** a suíte (`bash tools/dev/verify.sh`) roda uma vez, no fechamento da sprint, antes da aprovação do PO.
- **IDs:** cards da v2 a partir de OG-200 (E8 200–209, E9 210–219, E10 220–229, E11 230–249, E12 250–269, E13 270–279).

### 15.1 Prioridades (P0)
1. **Novo menu (E8):** visual limpo, moderno e legível; **uma única fonte**, sem opção de troca.
2. **Perfil social e relatórios (E9):** páginas para conhecer outros jogadores (companheiros de time, marcos, partidas, kills, deaths...) e relatórios de partida. Não é rede social com interação: é navegar e conhecer. Ficam no cliente atual; um site público fica para um repositório próprio no futuro (D-36).
3. **Trilha sonora (E10):** "Outgun Epic" no menu; nas partidas casuais, as demais músicas em ordem aleatória; opção para desligar.

### 15.2 Regras de negócio da v2
| RN | Regra |
|---|---|
| RN-UI-01 | Toda tela fora da partida usa o design system v2 (tokens e componentes do OG-200) e funciona em telas de computador (de 1280×720 a telas grandes), por teclado, mouse e gamepad. No celular, só as telas do portal (RN-UI-08, D-80); as demais mostram um aviso. |
| RN-UI-02 | A interface usa **uma única fonte** (D-35). O jogador não pode trocá-la. |
| RN-UI-03 | Texto e fundo com contraste mínimo AA (4,5:1). |
| RN-UI-04 | "Jogar agora" fica a um clique da tela inicial. |
| RN-SOC-01 | Perfis, relatórios de partida e ranking têm URL estável no cliente (`/players/:nome`, `/matches/:id`, `/ranking`) e são páginas web com rolagem, não menus. |
| RN-SOC-02 | O perfil mostra números por modo (Ranked/Casual) e por período, companheiros e rivais frequentes e partidas recentes; bots e convidados não entram como companheiros/rivais. |
| RN-SOC-03 | Marcos são concedidos automaticamente por feitos em partidas com conta, com data de conquista, inclusive retroativamente. Feitos fora da partida (pódio do hall da fama, OG-392) também valem, com a data do feito. Ids de marco são estáveis e nunca renomeados. |
| RN-SOC-04 | Jogadores podem ser buscados por nome ou clã, sem diferença de maiúsculas e acentos. |
| RN-SOC-05 | Páginas sociais só mostram dados públicos; e-mail e dados sensíveis nunca aparecem. O jogador pode esconder companheiros/rivais e histórico (D-39). |
| RN-SOC-06 | Marcos **secretos** (OG-398) não mostram nome nem condição a quem não os tem (nem na API); quem desbloqueia vê tudo, e o perfil mostra quem descobriu cada um primeiro. Só valem partidas com 4+ jogadores com conta, sem contar kills em bots, e cada um é calibrado para no máximo ~1% dos jogadores ativos. |
| RN-SOC-07 | Conquistas da Steam (OG-396/397) espelham os marcos da conta: o marco do jogo é a fonte de verdade, o app desktop só desbloqueia na Steam o que a conta já tem (D-77); secretos são *hidden* na Steam. |
| RN-SOC-08 | **v2:** O relatório completo da partida e o da série podem ser baixados em PDF (A4, texto selecionável, idioma do jogador), gerado no cliente, com as mesmas seções da tela e o link da página no rodapé. |
| RN-MUS-01 | O menu abre com o tema ("Outgun Main Theme", `Outgun epic.mp3`) na primeira vez em que a sessão do navegador toca música; depois rotaciona as demais faixas em ordem aleatória, com crossfade. A tela inicial tem um tocador com a faixa atual (título, artista, álbum e ano das tags ID3), pausar, próxima faixa e mudo. |
| RN-MUS-02 | Partidas casuais tocam as demais faixas de `songs/` em ordem aleatória, sem repetir até todas tocarem; "Outgun Epic" nunca toca em partida. Outros modos seguem a D-37. |
| RN-MUS-03 | Música e efeitos têm volumes separados; a música começa só após um gesto do jogador (política de autoplay). |
| RN-MUS-04 | Nas Opções, o jogador liga/desliga a trilha sonora e ajusta o volume; a escolha é salva e sincronizada com a conta. |
| RN-MUS-05 | Música nunca entra no carregamento inicial do jogo; é baixada sob demanda e não é baixada com a trilha desligada. |
| RN-RKL-01 | **Formatos Ranked:** 3x3, 4x4 e 5x5 — N contra N jogadores com conta, sem bots salvo RN-RKL-19 (3x3 = 6 humanos). O formato é escolhido ao criar a sala e define o tamanho dela (2 × N). |
| RN-RKL-02 | **Séries:** md1, md3 ou md5, escolhida ao criar a sala. Vence a série o time que ganhar ⌈N/2⌉ jogos; os jogos restantes não são disputados. Séries são só facilitadoras (D-41): ao fim de um jogo que não encerra a série, todos voltam direto ao lobby da sala; ao fim da série (ou de uma md1), ao menu inicial. |
| RN-RKL-03 | Cada jogo de uma série é uma partida Ranked com relatório próprio, ligado à série (formato, número do jogo, placar da série). Cada jogo conta para o ranking como uma ranqueada normal (D-41). |
| RN-RKL-04 | O admin define a rotação Ranked **por formato** (um mapa pode estar no 4x4 e fora do 3x3); nenhum formato fica sem mapas. |
| RN-RKL-05 | Ao escolher "Ranked", o jogador vê primeiro a lista de salas abertas (formato, série, ocupação, fase, senha) e pode filtrar por formato, entrar numa sala ou criar uma. |
| RN-RKL-06 | Qualquer conta cria uma sala Ranked; ela pode ter senha (até 15 caracteres). Senha não muda regras: o preset continua travado (RN-MOD-04). |
| RN-RKL-07 | Ninguém entra no mapa enquanto a sala não estiver completa (2 × N jogadores, D-40). Até lá os jogadores ficam no lobby. |
| RN-RKL-08 | Jogadores do mesmo clã cadastrado (RN-CLA-01) entram preferencialmente do mesmo lado; sem clã ou empate, vale RN-TIM-01. |
| RN-RKL-09 | No lobby, o jogador troca de lado se houver vaga; com o outro lado cheio, pede a troca e ela só acontece com o aceite de um jogador de lá. |
| RN-RKL-10 | Com a sala completa há voto de mapa entre os mapas da rotação do formato. O voto termina quando todos votam ou em 30 s; empate → sorteio entre os empatados; sem votos → sorteio na rotação. |
| RN-RKL-11 | Depois do voto, todos precisam marcar "Pronto". Com todos prontos começa uma contagem de **5 s** antes de carregar o mapa. |
| RN-RKL-21 | Quem não marca "Pronto" em 60 s depois do voto sai da sala e a vaga reabre (D-43). |
| RN-CLA-01 | **Clã** é um cadastro da comunidade: nome (único), tag de 1 a 3 caracteres (única, sem diferença de maiúsculas e acentos), descrição, data de formação, membros e estatísticas. Substitui a clan tag livre (D-47). |
| RN-CLA-02 | Qualquer conta sem clã pode criar um e vira o **líder**. Cada jogador está em no máximo um clã. |
| RN-CLA-03 | Papéis: líder, admins e membros. Líder e admins convidam, aprovam pedidos e expulsam membros; só o líder muda a tag, promove/rebaixa admins, transfere a liderança e dissolve o clã. |
| RN-CLA-04 | Entrada só por **convite aceito** pelo jogador ou por **pedido aprovado** pelo clã. Convites e pedidos expiram em 7 dias. |
| RN-CLA-05 | A tag mostrada em jogo (chat, HUD, ticket) é a do clã atual do jogador; sem clã, sem tag. |
| RN-CLA-06 | Estatísticas do clã contam as partidas clã x clã (RN-RKL-14) e os números dos membros enquanto eram do clã; vale o clã do momento da partida. |
| RN-CLA-07 | Há ranking de clãs por temporada e geral, baseado nas partidas clã x clã (critério na D-47). |
| RN-CLA-08 | Nome, tag e descrição de clã passam pelo filtro de nomes; moderadores podem forçar troca ou dissolver, com auditoria. |
| RN-CLA-09 | O clã tem cor primária e secundária (paleta curada). Na partida, um lado com ≥ 2 humanos do mesmo clã e nenhum humano de outro clã (bots e humanos sem clã não contam) vira o clã a partir da rodada seguinte: tudo o que era da cor do lado passa à cor do clã e o nome do lado vira a tag (D-78). |
| RN-NUM-01 | Número de jogador único de 2 a 99, no centro do boneco; troca sem espera (OG-415; `NUMBER_COOLDOWN_DAYS` religa) e liberado depois de 60 dias sem jogar. O 1 é do líder do "Melhor do mês" do mês anterior, de uso opcional (D-79). |
| RN-RKL-22 | Temporadas são **mensais**: viram automaticamente no dia 1 às 00:00 (Brasília) e guardam a classificação final (D-48). **D-66:** desde novembro/2026 a temporada é o leaderboard mensal (RN-LDB). |
| RN-RKL-23 | Há um ranking **geral** de todas as temporadas (soma de score e neg), também por formato. **Descontinuada (D-66):** dados guardados; o "sempre" do leaderboard (RN-LDB-01) ocupa o lugar. |
| RN-RKL-24 | **Hall da fama:** os 3 primeiros de cada temporada encerrada no geral, em cada formato e entre os clãs, com selo no perfil e na página do clã. **D-66:** desde novembro/2026, pelos stats do leaderboard (RN-LDB-05). |
| RN-RKL-25 | **Duração do Ranked (D-61):** 20 min de tempo normal, sem alteração possível; quem estiver na frente vence. Empate aos 20 → prorrogação de 5 min, sem morte súbita: a partida segue até 8 capturas ou até os 25 min; empatada aos 25, termina empatada. |
| RN-RKL-26 | **Partida cancelada (D-62):** se um lado fica sem nenhum humano conectado e a janela de reconexão (RN-RKL-17) acaba sem volta, a partida é cancelada: sem bot substituto, sem rating, estatísticas, marcos ou clã (deltas parciais descartados) e fora do histórico (não vai à API); os jogadores veem o aviso. Na série, o jogo não conta e é disputado de novo. |
| RN-RKL-12 | Desmarcar "Pronto", trocar de lado, sair ou entrar alguém durante a contagem a cancela; ela recomeça do zero quando todos estiverem prontos de novo. |
| RN-RKL-13 | Estatísticas, partidas e ranking Ranked podem ser filtrados por formato (3x3, 4x4, 5x5); partidas anteriores aos formatos só aparecem em "Todos". Cada formato tem rating próprio; o rating geral soma score e neg dos três (D-42). **Rating por formato descontinuado (D-65):** o rating é único; o filtro por formato vale para estatísticas e leaderboard. |
| RN-RKL-14 | Partida **clã x clã**: todos de um lado do mesmo clã cadastrado e todos do outro de outro clã (ex.: nn x BC), lados completos. Ela é marcada no relatório e gera marcos próprios (RN-SOC-03). |
| RN-RKL-15 | **Pausa tática:** cada time tem 60 s de pausa por jogo, em até 3 pedidos (ex.: 3 × 20 s). Pausado, o mundo e o tempo da partida não avançam; o chat continua. Só no Ranked. |
| RN-RKL-16 | O saldo vale por jogo. A pausa termina quando o time que pediu retoma (o adversário não pode) ou quando o saldo acaba, sempre com contagem de retomada de 3 s (D-45). |
| RN-RKL-17 | No Ranked, a queda de conexão de um jogador pausa o jogo automaticamente, sem gastar o saldo do time, enquanto ele tem 120 s para reconectar ao mesmo lugar (D-46). |
| RN-RKL-18 | Sem reconexão no prazo (ou saída voluntária), o time desfalcado vota em 20 s (maioria; empate = bot): seguir com um a menos ou pôr um bot no lugar. Se o jogador voltar depois, retoma a vaga e o bot sai (D-46). |
| RN-RKL-19 | Bot no Ranked **só** como substituto aprovado pelo voto da RN-RKL-18, no máximo **2 por partida** somando os dois times; nenhum outro caminho adiciona bots. O bot se chama `BOT-<nome>` do jogador substituído e joga no nível do histórico Ranked dele; sem histórico, nível intermediário (OG-266). |
| RN-RKL-20 | Partidas Ranked com bot substituto (ou com um a menos) levam a marca "Concluída com bots" (ou "Com um a menos") no relatório, no perfil e na série, e continuam contando para o ranking. |
| RN-SKL-01 | **Rating de habilidade (D-65):** OpenSkill Plackett–Luce com parâmetros padrão; um rating por conta, único para todos os formatos e permanente (não zera por temporada, sem decaimento por tempo). Começa em μ 25, σ 25/3. |
| RN-SKL-02 | Atualiza a cada ranqueada concluída pelo resultado (vitória, derrota ou empate) e pela força dos dois times; o placar não importa. Casual e partidas canceladas (RN-RKL-26) não contam. |
| RN-SKL-03 | Todo humano com conta que começou a partida recebe o resultado do time, mesmo que tenha saído; bot substituto não tem rating e fica fora do cálculo; time com um a menos entra com quem tem. |
| RN-SKL-04 | Valor exibido = `max(0, round((μ − 3σ) × 100))`; com menos de 10 ranqueadas o jogador aparece "em calibração". Cada partida guarda a variação e a chance de vitória prevista. |
| RN-SKL-05 | O μ substitui a força score/neg onde ela era usada: desempate de time ao entrar (RN-TIM-01) e nível do bot substituto (RN-RKL-19). Balanceamento de lados no lobby fica para depois (OG-357). |
| RN-SKL-06 | Não há opção de ficar fora do rating nem do leaderboard: todo jogador com conta numa ranqueada participa. Quem não quer ser ranqueado joga Casual (PO, 2026-10-22). |
| RN-LDB-01 | **Leaderboard de atributos (D-66):** substitui o ranking por score/neg. Um ranking por stat individual, por temporada mensal (reinicia todo mês) e "sempre", com filtro por formato; só ranqueadas concluídas, sem bots. |
| RN-LDB-02 | Forma de ranquear: volume por 10 min jogados (abates sem bots, capturas, assistências, bandeiras pegas e devolvidas, portadores abatidos, tempo com bandeira, frags, dano bruto); razão no período (K/D, precisão); recorde (maior sequência de abates); média (tempo médio de vida). |
| RN-LDB-03 | Dano bruto = acertos em inimigos × `rocket_damage` da partida (inclui o excesso). Stats que dependem de contadores novos só valem a partir da implantação e mostram "desde DD/MM". |
| RN-LDB-04 | Mínimo de 5 ranqueadas no período para aparecer; desempate pelo total do stat e depois pelo nome. |
| RN-LDB-05 | **Hall da fama:** na virada do mês, os 3 primeiros de cada stat principal do mês encerrado (todos os formatos), com selo no perfil. Os selos do ranking antigo continuam como "ranking clássico"; o hall de clãs segue RN-CLA-07. |
| RN-LDB-06 | **Lista geral do mês (D-67):** índice de 0 a 100 = soma de peso × percentil em cada stat principal, entre quem tem o mínimo de partidas (1º = 1, último = 0). Pesos: capturas 25%, abates 20%, devoluções 20%, tempo com bandeira 15%, K/D 10%, precisão 10%. Os 3 primeiros entram no hall da fama ("Melhor do mês"). |
| RN-RAD-01 | **Radar de estilo (D-84):** 6 eixos em ordem fixa — Abates, Precisão, Sobrevivência, Bandeira, Defesa, Equipe (duelo à direita, time à esquerda, bandeira embaixo). Abates = kills sem bots/10 min; Precisão = hits ÷ shots; Sobrevivência = tempo médio de vida; Bandeira = (bandeiras pegas + 3 × capturas)/10 min; Defesa = (devoluções + portadores abatidos + defesas)/10 min; Equipe = (assistências + trocas)/10 min. |
| RN-RAD-02 | Cada eixo mostra o percentil (0–100) contra todos os ativos da temporada (mínimo da RN-LDB-04), com o valor bruto no detalhe. Só ranqueadas concluídas, sem bots. Período padrão = temporada atual; "sempre" é opção; filtro por formato como no leaderboard. |
| RN-RAD-03 | Amostra: menos de 3 ranqueadas no período → sem radar; de 3 a 9 → contorno tracejado e "poucos jogos". |
| RN-RAD-04 | Arquétipo pelo formato do radar: amplitude (maior − menor percentil) abaixo de 20 → Coringa; senão o eixo mais alto decide — Abates ou Precisão → Atirador, Bandeira → Corredor, Defesa → Muralha, Equipe → Suporte, Sobrevivência → Sobrevivente. Sem radar, sem arquétipo. |
| RN-RAD-05 | Radar de clã = mediana dos percentis dos membros, eixo a eixo, só nas partidas pelo clã (RN-CLA-06). Na prévia de um clã x clã, a mediana é de quem está escalado na série, não do clã inteiro. |
| RN-EMB-01 | **Emblema do clã (D-85):** moldura + símbolo + detalhes (filete, inverter) sobre as cores do clã (primária no fundo, secundária no símbolo), de listas fechadas, sem envio de imagem. O símbolo é a tag (1 a 3 caracteres) ou um desenho do catálogo; todos são desenhos próprios. Clã que nunca escolheu usa o padrão: escudo + tag. |
| RN-EMB-02 | Cada emblema é único entre os clãs: moldura, símbolo, filete e as duas cores como aparecem (depois de inverter) não se repetem. Troca de emblema ou de cores do clã que repetiria outro é recusada. |
| RN-EMB-03 | Líder e admins escolhem e trocam o emblema, sem espera. Moderadores podem voltar o emblema ao padrão, com auditoria. |
| RN-EMB-04 | O emblema aparece no portal (clã, listas, ranking e hall de clãs, perfil, tela inicial, lobby Ranked e série), no relatório e no PDF (o emblema do dia da partida) e, na partida, só quando o lado vira o clã (RN-CLA-09): no chão da base e no fim de rodada/partida. Não aparece na bandeira, no minimapa, no chat nem no boneco (RN-UI-05). |
| RN-EMB-05 | Molduras do hall da fama: o clã com pódio no ranking de clãs de uma temporada (RN-CLA-07) libera a moldura dourada (1º), prateada (2º) ou bronze (3º) e as de posição abaixo da sua, de uso opcional. |
| RN-TRN-01 | **Modos de treino (D-86):** a sala privada Casual pode usar um preset de treino (Ataque, Defesa, Fuga, Captura): só humanos × bots, em tentativas que reiniciam sozinhas (posicionar, contagem, jogar, resultado, reinício), sem placar de partida, tempo limite nem fim de partida. Treino não conta para nada: não grava partida nem replay e fica fora de estatísticas, ranking, rating, radar, relatórios e marcos. |
| RN-TRN-02 | "Quadrado da base" é a sala (tela) onde fica o ponto da bandeira do time. No Ataque, o portador sair dele com a bandeira é sucesso; na Defesa, é falha. |
| RN-TRN-03 | Nas salas de treino, cada bot tem um papel fixo do modo (guardar a base, atacar a bandeira, perseguir o portador, levar a bandeira, escoltar o portador). Fora delas, os bots não mudam. |
| RN-TRN-04 | Fim da tentativa por modo. **Ataque** (1 a 4 defensores): falha se o atacante morre; sucesso se todos os defensores caem ou se o portador sai do quadrado da base. **Defesa** (você + 1 ou 2 aliados × 1 a 5 atacantes, que saem juntos): falha se você morre ou se a bandeira sai do quadrado da base; sucesso se todos os atacantes caem. **Fuga** (1 a 4 perseguidores): começa com a bandeira na base inimiga; falha se você morre; sucesso ao capturar na sua base. **Captura** (portador + escolta de 0 a 3, cenário variado): falha se a bandeira é entregue ou se você morre; sucesso ao devolver a bandeira. |
| RN-TRN-05 | Convidados entram por convite/senha e escolhem o lado: o de treino ou o oposto, onde assumem a vaga de um bot. A tentativa só falha por morte quando todos os humanos do lado de treino morreram. |
| RN-TRN-06 | Power-ups desligados por padrão (a sala pode ligar). Só mapas da rotação Casual com bandeira dos dois times. Uma sala de treino aberta por conta. |
| RN-TRN-07 | Nível dos bots fixo (1 a 5) ou progressivo: começa no 3, sobe um a cada 3 sucessos seguidos e desce um a cada 3 falhas seguidas. O início varia a cada tentativa (base, pontos de nascimento, portas), com opção de "mesmo início". |
| RN-NOM-04 | **v2:** a clan tag aparece no HUD da partida, em todos os modos, como `(TAG) nome` — mesmo formato do chat (RN-NOM-03) — seguindo RN-UI-05. |
| RN-UI-05 | Mudanças na UI **dentro da partida** não alteram a disposição atual do HUD: elementos novos são sobreposições temporárias numa área declarada; todo card que toca essa UI passa pela comparação de capturas do OG-265 (diferença zero fora da área nova) e é conferido numa partida online de verdade, com capturas para o PO (lição do OG-205). |
| RN-UI-06 | **v2:** O HUD da partida escala com a tela (D-54): texto, barras e placar seguem a escala do HUD (automática pela altura ou escolhida nas Opções); o layout é o do protótipo `plan/specs/hud-resolucoes/` (faixa em 4:3, coluna em telas largas). A partir dele, a RN-UI-05 volta a valer: novas mudanças não movem o que existe. |
| RN-UI-07 | **v2:** O jogador escolhe o estilo do HUD (D-55): Clássico, Moderno ou Personalizado. Nenhum estilo põe componente permanente sobre a sala; só avisos temporários e o placar do TAB, enquanto a tecla estiver pressionada. Os três mostram as mesmas informações (o Personalizado só muda lugar, tamanho e visibilidade). O Clássico segue protegido pela RN-UI-05; Moderno e Personalizado têm capturas próprias no `visual:check`. |
| RN-UI-08 | **v2:** No celular (toque sem mouse e lado menor da tela abaixo de 600 px), as telas do portal (D-80) funcionam de 360 a 600 px de largura, sem rolagem horizontal da página, com alvos de toque de pelo menos 44 px e o visual da S44; mostram as mesmas informações do desktop. Rotas do jogo e abas pesadas do painel mostram "disponível só no computador". O chunk do jogo nunca é baixado no celular. |
