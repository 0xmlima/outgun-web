# OG-002 — Build do Outgun original em Docker (oráculo)

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S0 |
| Status | Pronto |
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
- [ ] `docker build` reproduzível; imagem versionada.
- [ ] Servidor dedicado sobe com `bots_fill` e roda uma partida inteira sem humanos.
- [ ] Cliente original roda sob Xvfb e grava um replay; screenshots servem de referência visual.
- [ ] Documento `tools/parity/README.md` explica como usar.

## Notas técnicas
- Se o cliente não compilar, o card fecha com servidor + mapgen e um card novo é aberto para o cliente.
- Não alterar `src/`: qualquer ajuste de compilação vira patch em `tools/parity/patches/`.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
