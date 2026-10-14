// SPDX-License-Identifier: GPL-2.0-or-later
// Fixture OG-011: gera mapas aleatórios com o MapGenerator original, como ServerWorld::generate_map
// (src/world.cpp), e exporta o texto de cada mapa em JSON, junto com a ordem em que o FileFinder lista
// os blocos de mapgen/ (a escolha do bloco depende dela).
// Uso: pnpm oracle fixture mapgen "SEED W H OVER_EDGE RESPAWN REPETITIVE WILD ASSIM(0/1)"... > referência.json
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <string>

#include "mapgen.h"
#include "platform.h"
#include "utility.h"

static std::string json(const std::string& s) {
    std::string out = "\"";
    for (std::string::size_type i = 0; i < s.size(); ++i) {
        const unsigned char c = s[i];
        char buf[8];
        if (c == '"' || c == '\\') { out += '\\'; out += c; }
        else if (c < 0x20 || c >= 0x7F) { std::sprintf(buf, "\\u%04x", c); out += buf; }
        else out += c;
    }
    return out + "\"";
}

int main(int argc, char* argv[]) {
    directory_separator = '/';  // normalmente definido por platInit
    wheregamedir = "./";
    std::printf("{\"blocks\": [");
    FileFinder* finder = platMakeFileFinder(wheregamedir + "mapgen" + directory_separator, ".txt", false);
    for (bool first = true; finder->hasNext(); first = false)
        std::printf("%s%s", first ? "" : ",", json(finder->next()).c_str());
    delete finder;
    std::printf("],\n \"maps\": [\n");
    for (int i = 1; i < argc; ++i) {
        std::istringstream ist(argv[i]);
        unsigned seed;
        int w, h, asym;
        float overEdge, respawn, repetitive, wild;
        ist >> seed >> w >> h >> overEdge >> respawn >> repetitive >> wild >> asym;
        std::srand(seed);
        MapGenerator generator;
        int baseDistance = 0;
        for (int t = 0; t < 50; t++) {   // ServerWorld::generate_map
            baseDistance = generator.generate(w, h, rand() % 1000 < 1000 * overEdge, rand() % 1000 < 1000 * respawn,
                                              repetitive, rand() % 1000 < 1000 * wild, asym != 0);
            if (baseDistance > 1 || w <= 2 || h <= 2)
                break;
        }
        std::ostringstream text;
        generator.save_map(text, "<Random>", "Outgun");
        std::printf("  %s{\"params\": %s, \"baseDistance\": %d, \"text\": %s}\n", i > 1 ? "," : "", json(argv[i]).c_str(), baseDistance, json(text.str()).c_str());
    }
    std::printf(" ]\n}\n");
    return 0;
}
