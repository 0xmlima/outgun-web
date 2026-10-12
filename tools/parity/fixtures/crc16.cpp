// SPDX-License-Identifier: GPL-2.0-or-later
// Fixture OG-010: CRC16 do original (HawkNL nlGetCRC16) para entradas conhecidas.
// Uso: pnpm oracle fixture crc16 > packages/content/src/map/__fixtures__/crc16.json
#include <cstdio>
#include <string>
#include "utility.h"

int main() {
    const char* inputs[] = { "", "a", "123456789", "P width 6\n", "\xe9\xff\x80" };
    std::printf("[\n");
    for (unsigned i = 0; i < sizeof(inputs) / sizeof(inputs[0]); ++i) {
        const std::string s(inputs[i]);
        std::printf("%s  {\"bytes\": [", i ? ",\n" : "");
        for (unsigned k = 0; k < s.size(); ++k)
            std::printf("%s%u", k ? "," : "", (unsigned char)s[k]);
        std::printf("], \"crc\": %u}", (unsigned)CRC16(s));
    }
    std::printf("\n]\n");
}
