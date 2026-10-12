// SPDX-License-Identifier: GPL-2.0-or-later
// Fixture OG-020: tempo até impacto com paredes (Room::genGetTimeTillWall, que usa tryBounce de cada
// parede) e tempos de colisão jogador-foguete e jogador-jogador, calculados pelo código original.
// Uso: pnpm oracle fixture bounces ARQUIVO... > packages/sim/src/map/__fixtures__/bounces.json
// Linhas "wall":  [mapa, rx, ry, cx, cy, vx, vy, raio, maxFraction, t, sx, sy]   (t = 1e99: sem impacto)
// Linhas "rocket"/"player": [ax, ay, avx, avy, bx, by, bvx, bvy, raio, t]
#include <cstdio>
#include <string>

#define private public
#define protected public
#include "world.h"
#include "log.h"
#undef private
#undef protected

static unsigned lcg = 987654321u;
static double uniform(double lo, double hi) {
    lcg = lcg * 1103515245u + 12345u;
    return lo + (hi - lo) * ((lcg >> 8) & 0xFFFFFF) / double(0x1000000);
}

static void wallPoint(const WallBase* w, double& x, double& y) {
    if (const RectWall* r = dynamic_cast<const RectWall*>(w)) { x = uniform(r->a, r->c); y = uniform(r->b, r->d); }
    else if (const TriWall* t = dynamic_cast<const TriWall*>(w)) { x = (t->p1.x + t->p2.x + t->p3.x) / 3; y = (t->p1.y + t->p2.y + t->p3.y) / 3; }
    else { const CircWall* c = dynamic_cast<const CircWall*>(w); const double a = uniform(0, 6.283185307179586); x = c->c.x + c->ro * std::cos(a); y = c->c.y + c->ro * std::sin(a); }
}

int main(int argc, char* argv[]) {
    std::printf("{\"wall\": [\n");
    bool first = true;
    const double radii[] = { PLAYER_RADIUS, ROCKET_RADIUS, PLAYER_RADIUS + SHIELD_RADIUS_ADD };
    const double fractions[] = { 1., 1.01, .5, 3.35 };
    for (int i = 1; i < argc; ++i) {
        MemoryLog normal, errors;
        LogSet log(&normal, &errors, 0);
        Map map;
        if (!map.load_file(log, argv[i]))
            continue;
        for (int q = 0; q < 300; ++q) {
            const int rx = int(uniform(0, map.w)), ry = int(uniform(0, map.h));
            const Room& room = map[RoomCoords(rx, ry)];
            const double cx = uniform(0, plw), cy = uniform(0, plh);
            double vx = uniform(-45, 45), vy = uniform(-45, 45);
            if (q % 2 == 0 && !room.walls.empty()) {   // mira numa parede da sala
                double tx, ty;
                wallPoint(room.walls[int(uniform(0, room.walls.size()))], tx, ty);
                const double speed = uniform(1, 60);
                const double dx = tx - cx, dy = ty - cy, len = std::sqrt(dx * dx + dy * dy);
                if (len > 0) { vx = dx / len * speed; vy = dy / len * speed; }
            }
            if (q % 17 == 0) vx = 0;   // movimentos axiais e parado
            if (q % 23 == 0) vy = 0;
            const double r = radii[q % 3], f = fractions[q % 4];
            const BounceData bd = room.genGetTimeTillWall(Coords(cx, cy), Vec(vx, vy), r, f);
            const bool hit = bd.first < 1e10;
            std::printf("%s[\"%s\",%d,%d,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g]", first ? "" : ",\n", argv[i], rx, ry, cx, cy, vx, vy, r, f,
                        bd.first, hit ? bd.second.x : 0., hit ? bd.second.y : 0.);
            first = false;
        }
    }
    std::printf("\n],\n\"rocket\": [\n");
    ServerPlayer a, b;
    Rocket rk;
    for (int q = 0; q < 2000; ++q) {
        a.pos = WorldCoords(0, 0, uniform(0, plw), uniform(0, plh));
        a.vel = Vec(uniform(-30, 30), uniform(-30, 30));
        rk.pos = WorldCoords(0, 0, a.pos.x + uniform(-200, 200), a.pos.y + uniform(-200, 200));
        if (q % 3 == 0) {   // foguete vindo na direção do jogador
            const double dx = a.pos.x - rk.pos.x, dy = a.pos.y - rk.pos.y, len = std::sqrt(dx * dx + dy * dy);
            rk.vel = Vec(dx / len * 50, dy / len * 50);
        }
        else
            rk.vel = Vec(uniform(-50, 50), uniform(-50, 50));
        const double r = q % 2 ? PLAYER_RADIUS + ROCKET_RADIUS : PLAYER_RADIUS + SHIELD_RADIUS_ADD + POWER_ROCKET_RADIUS;
        const double t = WorldBase::getTimeTillCollision(a, rk, r);
        std::printf("%s[%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g]", q ? ",\n" : "", a.pos.x, a.pos.y, a.vel.x, a.vel.y, rk.pos.x, rk.pos.y, rk.vel.x, rk.vel.y, r, t);
    }
    std::printf("\n],\n\"player\": [\n");
    for (int q = 0; q < 2000; ++q) {
        a.pos = WorldCoords(0, 0, uniform(0, plw), uniform(0, plh));
        a.vel = Vec(uniform(-30, 30), uniform(-30, 30));
        b.pos = WorldCoords(0, 0, a.pos.x + uniform(-120, 120), a.pos.y + uniform(-120, 120));
        b.vel = q % 3 == 0 ? Vec(-a.vel.x, -a.vel.y) : Vec(uniform(-30, 30), uniform(-30, 30));
        const double r = 2 * PLAYER_RADIUS;
        const double t = WorldBase::getTimeTillCollision(a, b, r);
        std::printf("%s[%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g]", q ? ",\n" : "", a.pos.x, a.pos.y, a.vel.x, a.vel.y, b.pos.x, b.pos.y, b.vel.x, b.vel.y, r, t);
    }
    std::printf("\n]}\n");
}
