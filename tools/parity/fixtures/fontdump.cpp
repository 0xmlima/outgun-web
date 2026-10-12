// SPDX-License-Identifier: GPL-2.0-or-later
// Referência OG-013: carrega as fontes dos .dat com a própria Allegro (como Graphics::load_font) e
// desenha cada glifo com textout_ex; imprime os pixels em JSON.
// Uso: pnpm oracle allegro fontdump ARQUIVO.dat... > tools/asset-pipeline/src/__fixtures__/fonts-reference.json
#include <allegro.h>
#include <cstdio>
#include <string>

static void dumpFont(FONT* f) {
    std::printf("{\"height\":%d,\"glyphs\":[", text_height(f));
    bool first = true;
    for (int r = 0; r < get_font_ranges(f); ++r)
        for (int c = get_font_range_begin(f, r); c <= get_font_range_end(f, r); ++c) {
            char str[8];
            const int len = usetc(str, c);
            str[len] = 0;
            const int w = text_length(f, str), h = text_height(f);
            BITMAP* bmp = create_bitmap_ex(8, w > 0 ? w : 1, h);
            clear_to_color(bmp, 0);
            textout_ex(bmp, f, str, 0, 0, 1, -1);
            std::printf("%s[%d,%d,%d,\"", first ? "" : ",", c, w, h);
            for (int y = 0; y < h; ++y)
                for (int x = 0; x < w; ++x)
                    std::putchar(getpixel(bmp, x, y) ? '1' : '0');
            std::printf("\"]");
            destroy_bitmap(bmp);
            first = false;
        }
    std::printf("]}");
}

int main(int argc, char* argv[]) {
    install_allegro(SYSTEM_NONE, &errno, atexit);
    set_uformat(U_UTF8);
    std::printf("{\n");
    for (int i = 1; i < argc; ++i) {
        std::string name(argv[i]);
        std::printf("%s  \"%s\": {", i > 1 ? ",\n" : "", name.substr(name.rfind('/') + 1).c_str());
        const char* objects[] = { "font", "border" };
        for (int o = 0; o < 2; ++o) {
            DATAFILE* d = load_datafile_object(argv[i], objects[o]);
            std::printf("%s\"%s\":", o ? "," : "", objects[o]);
            if (d) {
                dumpFont(static_cast<FONT*>(d->dat));
                unload_datafile_object(d);
            }
            else
                std::printf("null");
        }
        std::printf("}");
    }
    std::printf("\n}\n");
    return 0;
}
END_OF_MAIN()
