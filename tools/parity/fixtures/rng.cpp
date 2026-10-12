// SPDX-License-Identifier: GPL-2.0-or-later
// Fixture OG-004: sequências de rand() (glibc) e std::random_shuffle (libstdc++) do build original.
// Uso: pnpm oracle fixture rng > packages/sim/src/rng/__fixtures__/glibc-rand.json
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <vector>

static void printRand(unsigned seed, bool callSrand, int count) {
    if (callSrand)
        srand(seed);
    std::printf("    {\"seed\": %u, \"srand\": %s, \"values\": [", seed, callSrand ? "true" : "false");
    for (int i = 0; i < count; ++i)
        std::printf("%s%d", i ? "," : "", rand());
    std::printf("]}");
}

int main() {
    std::printf("{\n  \"generator\": \"glibc rand() / libstdc++ random_shuffle (Debian 9, glibc 2.24, GCC 6.3)\",\n");
    std::printf("  \"rand\": [\n");
    printRand(1, false, 1000); // sem srand: semente padrão
    const unsigned seeds[] = { 0, 1, 2, 42, 12345, 2147483647u, 4294967295u };
    for (unsigned i = 0; i < sizeof(seeds) / sizeof(seeds[0]); ++i) {
        std::printf(",\n");
        printRand(seeds[i], true, i == 3 ? 10000 : 1000);
    }
    std::printf("\n  ],\n  \"shuffle\": [\n");
    srand(7);
    for (int n = 1; n <= 32; ++n) {
        std::vector<int> v;
        for (int i = 0; i < n; ++i)
            v.push_back(i);
        std::random_shuffle(v.begin(), v.end());
        std::printf("%s    [", n > 1 ? ",\n" : "");
        for (int i = 0; i < n; ++i)
            std::printf("%s%d", i ? "," : "", v[i]);
        std::printf("]");
    }
    std::printf("\n  ],\n  \"shuffleSeed\": 7,\n  \"randAfterShuffle\": %d\n}\n", rand());
}
