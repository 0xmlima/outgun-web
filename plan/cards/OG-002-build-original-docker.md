# OG-002 — Build do Outgun original em Docker (oráculo)

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S0 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-parity-harness` |

## História
Como dev, quero compilar e rodar o Outgun original de forma reproduzível, para usá-lo como oráculo de comportamento e fonte de golden traces.

## Contexto e referências no original
- `compile.sh` (dependências: Allegro 4, HawkNL, pthreads).
- `DEDICATED_SERVER_ONLY` permite build só do servidor (sem Allegro gráfico).
- `src/tools/mapgen-main.cpp`, `src/tools/mapconv.cpp`.

## Escopo
- Dockerfile em `tools/parity/docker/` com toolchain compatível (GCC antigo, ex. Debian jessie/stretch ou `gcc:4.9`), Allegro 4.4 e HawkNL 1.68.
- Alvos: servidor dedicado, cliente (para gravar replays/screenshot com Xvfb), `mapgen`.
- Gerar `compile_commands.json` (bear) para navegação com clangd.
- Script `tools/parity/run-server.sh` que sobe servidor dedicado com bots e mapa fixo.

## Critérios de aceite
- [x] `docker build` reproduzível; imagem versionada.
- [x] Servidor dedicado sobe com `bots_fill` e roda uma partida inteira sem humanos.
- [x] Cliente original roda sob Xvfb e grava um replay; screenshots servem de referência visual. _(o replay é gravado pelo servidor e reproduzido pelo cliente original; ver notas)_
- [x] Documento `tools/parity/README.md` explica como usar.

## Notas técnicas
- Se o cliente não compilar, o card fecha com servidor + mapgen e um card novo é aberto para o cliente.
- Não alterar `src/`: qualquer ajuste de compilação vira patch em `tools/parity/patches/`.

## Notas de implementação
- **Entregáveis:** `tools/parity/docker/Dockerfile`, `tools/parity/docker/entrypoint.sh`, `tools/parity/oracle.sh` (atalho `pnpm oracle`), `tools/parity/README.md`, `tools/parity/patches/README.md`, `.dockerignore`.
- **Toolchain:** `debian/eol:stretch` fixado por digest (último Debian com HawkNL empacotado), Allegro 4.4.2, GCC 6.3. Imagem `outgun-oracle:1` (682 MB) com label da revisão git.
- **Sem patches no código:** só flags extras `-std=gnu++98 -fpermissive` além das originais; `Makefile.common` copiado para `Makefile` dentro da imagem. Todos os alvos compilam: `outgun`, `outgun-ded`, `srvmonit`, `relay`, `watchserver` e `mapgen-tool` (ligado à parte).
- **Validação feita:**
  - `server` com 6 bots e `time_limit 1`: partida inteira jogada, mapa reiniciado aos 60 s, sem erros.
  - `server --bottest`: 586 partidas de 2 min em 40 s de relógio, 41 replays mantidos (~39 KB cada).
  - `replay`: cliente original sob Xvfb reproduz o replay; screenshots com mapa, bots, minimapa, placar e mensagens.
  - `mappic`: 45 imagens (todos os mapas de `maps/` e `cmaps/`), referência para OG-061.
  - `mapgen 3 2`: gerador original funcionando.
  - `compile-commands`: 75 entradas para o clangd.
- **Descobertas** (detalhes em `tools/parity/README.md`): opção não documentada `-bottest` (tempo acelerado, base para OG-003); replays sem humanos são descartados fora do `-bottest`; a gravação começa na segunda partida; cliente precisa de `config/language.txt` e da política de bug report na primeira execução.
- **Rede:** servidor e cliente tentam contatar o master server e o ranking antigos; o oráculo roda com `--network none`.
- **Risco para OG-003:** o build original usa `-ffast-math`; medir o impacto na paridade com JavaScript comparando builds com e sem a flag (`--build-arg OUTGUN_CXXFLAGS`).
- Branch: `og-002-build-original-docker`.
