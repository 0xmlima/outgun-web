# SPDX-License-Identifier: GPL-2.0-or-later
# Oráculo do Outgun 1.0.3 original (card OG-002): compila cliente, servidor dedicado e ferramentas
# a partir dos fontes intocados do repositório. Build a partir da raiz do repositório:
#   docker build -f tools/parity/docker/Dockerfile -t outgun-oracle .
#
# Debian 9 (stretch, arquivado) é a distribuição mais recente que ainda empacota HawkNL 1.6.8;
# traz também Allegro 4.4.2 e GCC 6.3, próximos da toolchain da época do jogo.
FROM debian/eol:stretch@sha256:87de8b3de9239bd73f9d73bd3816411e156705c7517dd0177b50136e97cdb43f

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential liballegro4-dev libhawknl-dev libpng-dev zlib1g-dev bear patch \
      xvfb xauth x11-apps xdotool imagemagick procps \
 && rm -rf /var/lib/apt/lists/*

# Flags originais do Makefile.common (-W -Wall -O3 -ffast-math -fno-enforce-eh-specs) mais o mínimo
# para um GCC moderno aceitar código pré-C++11: -std=gnu++98 (stream -> bool implícito) e
# -fpermissive (lookup em duas fases nos templates de menu.h). Não muda o comportamento do jogo.
# O harness de paridade (OG-003) pode sobrescrever, ex. para compilar sem -ffast-math.
ARG OUTGUN_CXXFLAGS="-W -Wall -O3 -ffast-math -fno-enforce-eh-specs -std=gnu++98 -fpermissive"
ENV OUTGUN_CXXFLAGS=$OUTGUN_CXXFLAGS

WORKDIR /outgun
# Dados do jogo: o executável procura config/, maps/, languages/... no próprio diretório.
COPY src/ src/
COPY config/ config/
COPY maps/ maps/
COPY cmaps/ cmaps/
COPY mapgen/ mapgen/
COPY languages/ languages/
COPY graphics/ graphics/
COPY sound/ sound/
COPY fonts/ fonts/
COPY keyboard.dat ./
COPY tools/parity/patches/ /oracle/patches/

# O compile.sh original chama "make -C src", mas o snapshot só traz Makefile.common: a cópia é feita aqui,
# dentro da imagem. Patches (se houver) também só são aplicados aqui; o repositório fica intocado.
RUN cd src \
 && cp Makefile.common Makefile \
 && for p in /oracle/patches/*.patch; do [ -e "$p" ] || continue; echo "aplicando $p"; patch -p1 < "$p"; done \
 && bear make LINUX=1 -j"$(nproc)" CXXFLAGS="$OUTGUN_CXXFLAGS" outgun outgun-ded tools \
 && g++ $OUTGUN_CXXFLAGS -DDEDICATED_SERVER_ONLY -o ../mapgen-tool tools/mapgen-main.cpp \
      obj/text/mapgen.o obj/text/nassert.o obj/text/utility.o obj/text/commont.o obj/text/globals.o \
      obj/text/language.o obj/text/log.o obj/text/mutex.o obj/text/debug.o obj/text/timer.o \
      obj/text/version.o obj/text/platform_unix.o obj/text/network.o obj/text/binaryaccess.o \
      -lNL -pthread \
 && mkdir -p ../log ../replay ../server_stats

COPY tools/parity/docker/entrypoint.sh /oracle/entrypoint.sh
ENTRYPOINT ["/oracle/entrypoint.sh"]
CMD ["help"]
