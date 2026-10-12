// SPDX-License-Identifier: GPL-2.0-or-later
// Fixture OG-010/OG-020: consultas de interseção (intersects_circ / intersects_rect) contra as paredes
// reais dos mapas, com o código original. Entradas geradas por um LCG próprio (determinístico).
// Uso: pnpm oracle fixture walls ARQUIVO... > packages/sim/src/map/__fixtures__/wall-intersections.json
// Cada consulta: [mapa, rx, ry, índice da parede, tipo (0 = círculo, 1 = retângulo), a, b, c, [d], resultado]
#include <cstdio>
#include <string>

#define private public
#define protected public
#include "world.h"
#include "log.h"
#undef private
#undef protected

static unsigned lcg = 12345;
static double uniform(double lo, double hi) {
    lcg = lcg * 1103515245u + 12345u;
    return lo + (hi - lo) * ((lcg >> 8) & 0xFFFFFF) / double(0x1000000);
}

static void bounds(const WallBase* w, double& x1, double& y1, double& x2, double& y2) {
    if (const RectWall* r = dynamic_cast<const RectWall*>(w)) { x1 = r->a; y1 = r->b; x2 = r->c; y2 = r->d; }
    else if (const TriWall* t = dynamic_cast<const TriWall*>(w)) { x1 = t->boundx1; y1 = t->boundy1; x2 = t->boundx2; y2 = t->boundy2; }
    else { const CircWall* c = dynamic_cast<const CircWall*>(w); x1 = c->c.x - c->ro; y1 = c->c.y - c->ro; x2 = c->c.x + c->ro; y2 = c->c.y + c->ro; }
}

int main(int argc, char* argv[]) {
    std::printf("[\n");
    bool firstOut = true;
    for (int i = 1; i < argc; ++i) {
        MemoryLog normal, errors;
        LogSet log(&normal, &errors, 0);
        Map map;
        if (!map.load_file(log, argv[i]))
            continue;
        int perMap = 0;
        // Retângulos são muitos: limite de ~400 consultas por mapa. Triângulos e círculos: 30 cada.
        for (int x = 0; x < map.w; ++x)
            for (int y = 0; y < map.h; ++y) {
                const std::vector<WallBase*>& walls = map[RoomCoords(x, y)].walls;
                for (unsigned k = 0; k < walls.size(); ++k) {
                    const bool isRect = dynamic_cast<const RectWall*>(walls[k]) != 0;
                    if (isRect && perMap >= 400)
                        continue;
                    double x1, y1, x2, y2;
                    bounds(walls[k], x1, y1, x2, y2);
                    x1 -= 40; y1 -= 40; x2 += 40; y2 += 40;
                    const int queries = isRect ? 3 : 30;
                    for (int q = 0; q < queries; ++q, perMap += isRect) {
                        if (q % 3 < 2) {
                            const double cx = uniform(x1, x2), cy = uniform(y1, y2), r = uniform(0.5, 45);
                            const bool hit = walls[k]->intersects_circ(Vec(cx, cy), r);
                            std::printf("%s[\"%s\",%d,%d,%u,0,%.17g,%.17g,%.17g,%d]", firstOut ? "" : ",\n", argv[i], x, y, k, cx, cy, r, hit ? 1 : 0);
                        }
                        else {
                            double ax = uniform(x1, x2), bx = uniform(x1, x2), ay = uniform(y1, y2), by = uniform(y1, y2);
                            if (bx < ax) std::swap(ax, bx);
                            if (by < ay) std::swap(ay, by);
                            const bool hit = walls[k]->intersects_rect(ax, ay, bx, by);
                            std::printf("%s[\"%s\",%d,%d,%u,1,%.17g,%.17g,%.17g,%.17g,%d]", firstOut ? "" : ",\n", argv[i], x, y, k, ax, ay, bx, by, hit ? 1 : 0);
                        }
                        firstOut = false;
                    }
                }
            }
    }
    std::printf("\n]\n");
}
