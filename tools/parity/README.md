# Oráculo do Outgun original

O jogo original, compilado sem alterações dentro de Docker, é a referência de comportamento do port (PLAN.md seções 2 e 3; skill `outgun-parity-harness`). Card: OG-002. O harness de golden traces (OG-003) será construído em cima deste oráculo.

## Uso

```bash
pnpm oracle build                 # constrói a imagem outgun-oracle:1 (~3 min na primeira vez)
pnpm oracle help                  # comandos disponíveis no container
pnpm oracle server --bottest --seconds 30 --bots 6 --time-limit 2 --map outgun1
pnpm oracle replay "/out/server/replay/<arquivo>.replay" --shots 6 --interval 5
pnpm oracle mappic                # imagem de todos os mapas de maps/ e cmaps/
pnpm oracle mapgen 4 3            # gerador de mapas aleatórios original
pnpm oracle compile-commands      # compile_commands.json na raiz, para o clangd navegar em src/
pnpm oracle fixture rng           # compila e roda tools/parity/fixtures/rng.cpp contra o código original
```

### Fixtures: chamar o código original diretamente

`pnpm oracle fixture NOME [args]` compila `tools/parity/fixtures/NOME.cpp` com as mesmas flags do jogo, liga a **todos os objetos do servidor dedicado original** (exceto `main.o`) e imprime a saída do programa. Assim qualquer função do original (geometria, parser de mapa, física) pode gerar dados de referência sem patch. Os dados gerados ficam em `__fixtures__/` dos pacotes TS, ignorados pelo Prettier. Exemplo: `pnpm oracle fixture rng > packages/sim/src/__fixtures__/glibc-rand.json`.

Resultados ficam em `tools/parity/out/` (montado como `/out` no container; ignorado pelo git). Caminhos passados ao container usam `/out/...`.

## O que foi compilado e como

| Item         | Valor                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Base         | `debian/eol:stretch` (Debian 9 arquivado), fixada por digest                                                 |
| Dependências | Allegro 4.4.2, HawkNL 1.6.8 (último Debian que empacota), libpng, zlib                                       |
| Compilador   | GCC 6.3                                                                                                      |
| Flags        | as do `src/Makefile.common` (`-W -Wall -O3 -ffast-math -fno-enforce-eh-specs`) + `-std=gnu++98 -fpermissive` |
| Alvos        | `outgun` (cliente), `outgun-ded` (servidor dedicado), `srvmonit`, `relay`, `watchserver`, `mapgen-tool`      |

Ajustes de build, todos dentro da imagem (o repositório não é alterado):

- `compile.sh` chama `make -C src`, mas o snapshot só tem `src/Makefile.common`; o Dockerfile copia para `Makefile`.
- `-std=gnu++98`: o código usa conversão implícita de stream para `bool` (removida no C++11).
- `-fpermissive`: lookup em duas fases nos templates de `menu.h` (GCC moderno é mais estrito).
- `mapgen-tool` não tem alvo no Makefile; é ligado a partir de `src/tools/mapgen-main.cpp` e dos objetos do servidor.

## Comportamentos do original descobertos

- **`-bottest`** (opção não documentada, `src/main.cpp:317`): modo de teste de bots. Os frames avançam assim que todos os bots reagem — uma partida de 2 min roda em ~0,07 s —, o jogo reinicia no frame 100 e os replays são mantidos mesmo sem humanos. Base natural para o OG-003. Exige `bot_ping` múltiplo de 100 (o preset Clássico usa 100).
- **Replays sem humanos são descartados** fora do `-bottest`: o servidor só mantém o arquivo se `humanos >= recording` (`Server::stop_recording`, `src/server.cpp:722`).
- **Gravação começa na partida seguinte** ao início do servidor (depois do primeiro game over).
- **Primeira execução do cliente** abre seleção de idioma (`config/language.txt`) e política de bug report (`config/maincfg.txt`), que esperam teclado. O modo `replay` cria esses arquivos dentro do container.
- **Acesso à rede**: servidor e cliente tentam falar com o master server (`outgun.mbnet.fi`) e o servidor de ranking antigos. Por isso o container roda com `--network none`; o cliente mostra o aviso "Getting server list ... unreachable", fechado automaticamente com `xdotool`.
- **Diretório do jogo** = diretório do executável (`/proc/self/exe`, `src/platform_unix.cpp:167`); logs em `log/`, replays em `replay/`.

## Atenção para paridade (OG-003)

O build usa `-ffast-math`, como o jogo distribuído. Isso permite ao compilador reordenar operações de ponto flutuante, o que pode impedir igualdade bit a bit com JavaScript. O OG-003 deve comparar traces de um build com e sem `-ffast-math` (`docker build --build-arg OUTGUN_CXXFLAGS=...`) para medir o impacto antes de escolher a referência.
