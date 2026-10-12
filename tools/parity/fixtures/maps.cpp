// SPDX-License-Identifier: GPL-2.0-or-later
// Fixture OG-010: carrega mapas com o parser original (Map::load_file) e exporta o resultado em JSON.
// Uso: pnpm oracle fixture maps ARQUIVO... > packages/content/src/map/__fixtures__/maps.json
// Caminhos relativos ao diretório do jogo (/outgun) ou absolutos (/fixtures/...).
#include <cstdio>
#include <deque>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

// Acesso aos campos privados das paredes (só leitura; não muda o layout das classes).
#define private public
#define protected public
#include "world.h"
#include "log.h"
#undef private
#undef protected

static std::string json(const std::string& s) {
    std::string out = "\"";
    for (std::string::size_type i = 0; i < s.size(); ++i) {
        const unsigned char c = s[i];
        char buf[8];
        if (c == '"' || c == '\\') { out += '\\'; out += c; }
        else if (c < 0x20 || c >= 0x7F) { std::sprintf(buf, "\\u%04x", c); out += buf; } // bytes ISO-8859-1
        else out += c;
    }
    return out + "\"";
}

static std::string num(double v) {
    char buf[40];
    std::sprintf(buf, "%.17g", v);
    return buf;
}

static std::string coords(const WorldCoords& c) {
    std::ostringstream o;
    o << "[" << c.room.x << "," << c.room.y << "," << num(c.x) << "," << num(c.y) << "]";
    return o.str();
}

static std::string wall(const WallBase* w) {
    std::ostringstream o;
    if (const RectWall* r = dynamic_cast<const RectWall*>(w))
        o << "{\"type\":\"rect\",\"tex\":" << r->tex << ",\"alpha\":" << r->alpha
          << ",\"a\":" << num(r->a) << ",\"b\":" << num(r->b) << ",\"c\":" << num(r->c) << ",\"d\":" << num(r->d) << "}";
    else if (const TriWall* t = dynamic_cast<const TriWall*>(w))
        o << "{\"type\":\"tri\",\"tex\":" << t->tex << ",\"alpha\":" << t->alpha
          << ",\"p\":[" << num(t->p1.x) << "," << num(t->p1.y) << "," << num(t->p2.x) << "," << num(t->p2.y) << "," << num(t->p3.x) << "," << num(t->p3.y) << "]"
          << ",\"bound\":[" << num(t->boundx1) << "," << num(t->boundy1) << "," << num(t->boundx2) << "," << num(t->boundy2) << "]}";
    else if (const CircWall* c = dynamic_cast<const CircWall*>(w))
        o << "{\"type\":\"circ\",\"tex\":" << c->tex << ",\"alpha\":" << c->alpha
          << ",\"c\":[" << num(c->c.x) << "," << num(c->c.y) << "],\"ro\":" << num(c->ro) << ",\"ri\":" << num(c->ri)
          << ",\"angle\":[" << num(c->angle[0]) << "," << num(c->angle[1]) << "]"
          << ",\"va1\":[" << num(c->va1.x) << "," << num(c->va1.y) << "],\"va2\":[" << num(c->va2.x) << "," << num(c->va2.y) << "]"
          << ",\"midvec\":[" << num(c->midvec.x) << "," << num(c->midvec.y) << "],\"anglecos\":" << num(c->anglecos) << "}";
    return o.str();
}

int main(int argc, char* argv[]) {
    std::printf("{\n");
    for (int i = 1; i < argc; ++i) {
        MemoryLog normal, errors;
        LogSet log(&normal, &errors, 0);
        Map map;
        const bool ok = map.load_file(log, argv[i]);
        std::printf("%s  %s: {\"ok\": %s, \"errors\": [", i > 1 ? ",\n" : "", json(argv[i]).c_str(), ok ? "true" : "false");
        bool first = true;
        while (errors.size()) {
            std::printf("%s%s", first ? "" : ",", json(errors.pop()).c_str());
            first = false;
        }
        std::printf("]");
        if (ok) {
            std::printf(",\n    \"width\": %d, \"height\": %d, \"title\": %s, \"author\": %s, \"crc\": %u,\n",
                        map.w, map.h, json(map.title).c_str(), json(map.author).c_str(), (unsigned)map.crc);
            for (int t = 0; t < 2; ++t) {
                std::printf("    \"team%d\": {\"flags\": [", t);
                for (unsigned k = 0; k < map.tinfo[t].flags.size(); ++k)
                    std::printf("%s%s", k ? "," : "", coords(map.tinfo[t].flags[k]).c_str());
                std::printf("], \"spawn\": [");
                for (unsigned k = 0; k < map.tinfo[t].spawn.size(); ++k)
                    std::printf("%s%s", k ? "," : "", coords(map.tinfo[t].spawn[k]).c_str());
                std::printf("], \"respawn\": [");
                for (unsigned k = 0; k < map.tinfo[t].respawn.size(); ++k) {
                    const WorldRect& r = map.tinfo[t].respawn[k];
                    std::printf("%s[%d,%d,%s,%s,%s,%s]", k ? "," : "", r.room.x, r.room.y, num(r.x1).c_str(), num(r.y1).c_str(), num(r.x2).c_str(), num(r.y2).c_str());
                }
                std::printf("]},\n");
            }
            std::printf("    \"wildFlags\": [");
            for (unsigned k = 0; k < map.wild_flags.size(); ++k)
                std::printf("%s%s", k ? "," : "", coords(map.wild_flags[k]).c_str());
            std::printf("],\n    \"rooms\": [");
            for (int x = 0; x < map.w; ++x)
                for (int y = 0; y < map.h; ++y) {
                    const Room& room = map[RoomCoords(x, y)];
                    std::printf("%s\n      {\"x\":%d,\"y\":%d,\"walls\":[", x || y ? "," : "", x, y);
                    for (unsigned k = 0; k < room.walls.size(); ++k)
                        std::printf("%s%s", k ? "," : "", wall(room.walls[k]).c_str());
                    std::printf("],\"ground\":[");
                    for (unsigned k = 0; k < room.ground.size(); ++k)
                        std::printf("%s%s", k ? "," : "", wall(room.ground[k]).c_str());
                    std::printf("]}");
                }
            std::printf("\n    ]");
        }
        std::printf("}");
    }
    std::printf("\n}\n");
}
