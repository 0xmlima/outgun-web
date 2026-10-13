// SPDX-License-Identifier: GPL-2.0-or-later
// Fixture OG-050: monta o AreaMap dos bots (src/bot_support.cpp) com o código original e exporta em JSON:
// áreas (sala, frequências e valores de respawn, vizinhos com portas, vizinhos reversos), a árvore de
// divisão de cada sala (SplitByX/SplitByY/SingleArea) e, para os mapas depois de -d, amostras de
// identifyArea e as tabelas de distância de Robot::BuildDistanceTable (src/robot.cpp:1000-1031)
// a partir de cada área, com peso de respawn 0 e 1 e os dois times.
// Uso: pnpm oracle fixture areamap MAPA... [-d MAPA...] | gzip > packages/bots/src/__fixtures__/areamap.json.gz
#include <cstdio>
#include <map>
#include <queue>
#include <string>
#include <vector>

#define private public
#define protected public
#include "bot_support_open.h"
#include "log.h"
#undef private
#undef protected

typedef AreaMap::Area Area;

static std::string num(double v) {
    char buf[40];
    std::sprintf(buf, "%.17g", v);
    return buf;
}

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

static std::map<const Area*, int> areaIndex;

static std::string tree(const AreaMap::RoomAreaMap::AreaMapLevel* l) {
    if (const AreaMap::RoomAreaMap::SingleArea* s = dynamic_cast<const AreaMap::RoomAreaMap::SingleArea*>(l)) {
        char buf[16];
        std::sprintf(buf, "%d", areaIndex[s->a]);
        return buf;
    }
    if (const AreaMap::RoomAreaMap::SplitByX* x = dynamic_cast<const AreaMap::RoomAreaMap::SplitByX*>(l))
        return "[\"x\"," + num(x->borderX) + "," + tree(x->l) + "," + tree(x->r) + "]";
    const AreaMap::RoomAreaMap::SplitByY* y = dynamic_cast<const AreaMap::RoomAreaMap::SplitByY*>(l);
    return "[\"y\"," + num(y->borderY) + "," + tree(y->t) + "," + tree(y->b) + "]";
}

// Cópia literal de Robot::BuildDistanceTable para um ponto de partida.
class DistanceComparison {
    DistanceTableId table;
public:
    DistanceComparison(DistanceTableId tab) : table(tab) { }
    bool operator()(const Area* a1, const Area* a2) const { return a1->distance[table] > a2->distance[table]; }
};

static void buildDistanceTable(AreaMap& areaMap, Area* start, double respawnWeight, int team) {
    const DistanceTableId num = Table_Main;
    static const int roomToRoomBaseDistance = 1000;
    areaMap.clearDistanceTable(num);
    std::priority_queue<const Area*, std::vector<const Area*>, DistanceComparison> workQueue((DistanceComparison(num)));
    start->distance[num] = 0;
    workQueue.push(start);
    while (!workQueue.empty()) {
        const Area* const a = workQueue.top();
        workQueue.pop();
        for (std::vector<Area::Neighbor>::const_iterator ni = a->neighbors().begin(); ni != a->neighbors().end(); ++ni) {
            if (ni->area->distance[num] != -1)
                continue;
            double dist = 1.;
            dist -= ni->area->respawnValue[ team] * respawnWeight * .5;
            dist += ni->area->respawnValue[!team] * respawnWeight;
            ni->area->distance[num] = a->distance[num] + static_cast<int>(dist * roomToRoomBaseDistance);
            workQueue.push(ni->area);
        }
    }
}

int main(int argc, char* argv[]) {
    std::printf("{\n");
    bool distances = false, firstMap = true;
    for (int i = 1; i < argc; ++i) {
        if (std::string(argv[i]) == "-d") { distances = true; continue; }
        MemoryLog normal, errors;
        LogSet log(&normal, &errors, 0);
        Map map;
        if (!map.load_file(log, argv[i])) {
            std::fprintf(stderr, "falha ao carregar %s\n", argv[i]);
            return 1;
        }
        AreaMap am(map);
        areaIndex.clear();
        for (unsigned a = 0; a < am.areas.size(); ++a)
            areaIndex[&am.areas[a]] = a;

        std::printf("%s  %s: {\"width\": %d, \"height\": %d, \"areas\": [\n", firstMap ? "" : ",\n", json(argv[i]).c_str(), map.w, map.h);
        firstMap = false;
        for (unsigned a = 0; a < am.areas.size(); ++a) {
            const Area& ar = am.areas[a];
            std::printf("    %s{\"room\":[%d,%d],\"rf\":[%s,%s],\"rv\":[%s,%s],\"n\":[", a ? "," : "", ar.room.x, ar.room.y,
                        num(ar.respawnFrequency[0]).c_str(), num(ar.respawnFrequency[1]).c_str(),
                        num(ar.respawnValue[0]).c_str(), num(ar.respawnValue[1]).c_str());
            for (unsigned n = 0; n < ar.n.size(); ++n) {
                const Area::Neighbor& nb = ar.n[n];
                std::printf("%s{\"dir\":%d,\"area\":%d,\"doors\":[", n ? "," : "", (int)nb.direction, areaIndex[nb.area]);
                for (unsigned d = 0; d < nb.doors.size(); ++d)
                    std::printf("%s[%s,%s]", d ? "," : "", num(nb.doors[d].first).c_str(), num(nb.doors[d].second).c_str());
                std::printf("]}");
            }
            std::printf("],\"rn\":[");
            for (unsigned r = 0; r < ar.rn.size(); ++r)
                std::printf("%s%d", r ? "," : "", areaIndex[ar.rn[r]]);
            std::printf("]}\n");
        }
        std::printf("  ], \"rooms\": [\n");
        for (int x = 0; x < map.w; ++x)
            for (int y = 0; y < map.h; ++y)
                std::printf("    %s%s\n", x || y ? "," : "", tree(am.roomMaps[x][y].topLevel).c_str());
        std::printf("  ]");
        if (distances) {
            std::printf(", \"samples\": [");
            // 13 x 10 pontos por sala, inclusive as bordas e um ponto fora da sala de cada lado.
            bool firstSample = true;
            for (int x = 0; x < map.w; ++x)
                for (int y = 0; y < map.h; ++y)
                    for (int ix = -1; ix <= 11; ++ix)
                        for (int iy = -1; iy <= 8; ++iy) {
                            const double px = ix * (plw / 10.) + 3, py = iy * (plh / 7.) + 2;
                            std::printf("%s[%d,%d,%s,%s,%d]", firstSample ? "" : ",", x, y, num(px).c_str(), num(py).c_str(),
                                        areaIndex[am.identifyArea(WorldCoords(x, y, px, py))]);
                            firstSample = false;
                        }
            std::printf("]");
            std::printf(", \"distances\": [\n");
            bool firstTable = true;
            for (unsigned a = 0; a < am.areas.size(); ++a)
                for (int combo = 0; combo < 3; ++combo) {
                    const double weight = combo ? 1. : 0.;
                    const int team = combo == 2 ? 1 : 0;
                    buildDistanceTable(am, &am.areas[a], weight, team);
                    std::printf("    %s{\"start\":%u,\"weight\":%s,\"team\":%d,\"d\":[", firstTable ? "" : ",", a, num(weight).c_str(), team);
                    firstTable = false;
                    for (unsigned b = 0; b < am.areas.size(); ++b)
                        std::printf("%s%d", b ? "," : "", am.areas[b].distance[Table_Main]);
                    std::printf("]}\n");
                }
            std::printf("  ]");
        }
        std::printf("}");
    }
    std::printf("\n}\n");
    return 0;
}
