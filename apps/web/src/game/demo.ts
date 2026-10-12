// SPDX-License-Identifier: GPL-2.0-or-later
// Partida local para ver o renderer funcionando antes da conexão com o servidor (OG-064): a
// simulação de verdade (@outgun/sim, preset Clássico) com jogadores de controles aleatórios.
import { presetSettings } from '@outgun/settings';
import {
  clearModifiersIfIdle,
  CONTROL,
  GlibcRand,
  gunDirectionFromControls,
  isStrafe,
  ROOM_HEIGHT,
  ServerSim,
  Vec,
  WorldState,
  type GameMap,
  type PhysicsCallbacks,
  type WorldCoords,
} from '@outgun/sim';
import type { EffectKind, EntityFrame, FlagView, PlayerView, RocketView } from './render/entity-frame.js';

const NAMES = ['Nix', 'Huntta', 'Spinal', 'ThOR27', 'Nosferatu', 'Gloomy', 'coiote', 'PHiN', 'Kiss', 'Luque', 'Rubens', 'Slim', 'Cebs', 'Devil', 'Flyer', 'jarule'];

export type DemoEvent = { readonly kind: EffectKind; readonly pos: WorldCoords; readonly team: number };

const coords = (p: { roomX: number; roomY: number; x: number; y: number }): WorldCoords => ({ room: { x: p.roomX, y: p.roomY }, x: p.x, y: p.y });

/** `ServerSim` que avisa quando foguetes batem (as explosões são só visuais). */
class DemoSim extends ServerSim {
  onRocketHit: (rid: number, pid: number | null) => void = () => {};

  override callbacks(): PhysicsCallbacks {
    const cb = super.callbacks();
    return {
      ...cb,
      rocketHitWall: (rid, power) => {
        this.onRocketHit(rid, null);
        cb.rocketHitWall(rid, power);
      },
      rocketHitPlayer: (rid, pid) => {
        this.onRocketHit(rid, pid);
        return cb.rocketHitPlayer(rid, pid);
      },
    };
  }
}

export class LocalDemo {
  readonly world: WorldState;
  private readonly sim: DemoSim;
  private readonly settings = presetSettings('classic');
  private readonly hitfx = new Map<number, number>();
  private readonly returnTime = new Map<string, number>();
  private readonly nextTurn = new Map<number, number>();
  private events: DemoEvent[] = [];
  /** Controles do jogador local (`me`); `null` = controles aleatórios como os outros. */
  private myInput: { controls: number; fire: boolean; dropFlag: boolean } | null = null;
  /** Placar de fim de partida: até este frame o mundo fica parado (`game_end_delay`). */
  private restartAt: number | null = null;

  constructor(
    private readonly map: GameMap,
    players: number,
    /** Jogador cuja vista a câmera segue. */
    readonly me = 0,
    /** Teste de carga: todos com arma no nível máximo e atirando sem parar (até 256 foguetes). */
    private readonly stress = false,
  ) {
    const maxPlayers = Math.max(2, players + (players % 2));
    this.world = new WorldState(map, maxPlayers);
    this.sim = new DemoSim(this.world, this.settings, new GlibcRand(1), {
      // fim de partida no meio do frame, como o servidor: o mapa reinicia e a próxima começa em 5 s
      gameOver: () => {
        this.sim.changeMap(map);
        this.restartAt = this.world.frame + 50;
      },
    });
    this.sim.onRocketHit = (rid, pid) => {
      const rk = this.world.rockets[rid]!;
      if (pid !== null) this.hitfx.set(pid, this.world.frame / 10 + 0.3);
      this.events.push({ kind: pid !== null ? 'gunExplosion' : rk.power ? 'powerWallExplosion' : 'wallExplosion', pos: coords(rk.pos), team: rk.team });
    };
    this.sim.loadMapFlags();
    for (let i = 0; i < players; i++) {
      const pid = (i % 2) * (maxPlayers / 2) + Math.floor(i / 2);
      this.sim.addPlayer(pid).awaitingClientReadies = 0;
    }
    this.sim.startGame();
  }

  /** Um frame da simulação (10 Hz) com novos controles aleatórios de vez em quando. */
  step(): DemoEvent[] {
    const world = this.world;
    if (this.restartAt !== null && world.frame >= this.restartAt) {
      this.restartAt = null;
      this.sim.startGame();
    }
    if (this.restartAt !== null) {
      world.frame++;
      return [];
    }
    const time = world.frame / 10;
    world.time = time; // relógio determinístico (D-09), como `Room.tick`
    for (const pl of this.world.players) {
      if (!pl) continue;
      if (pl.pid === this.me && this.myInput) {
        // como `Room.handle` faz com as mensagens `input` e `fire` do cliente
        const input = this.myInput;
        pl.controls = clearModifiersIfIdle(input.controls);
        if (!pl.dead && !isStrafe(pl.controls)) pl.gundir = gunDirectionFromControls(pl.gundir, pl.controls);
        if (input.fire && !pl.attack) {
          pl.attackOnce = true;
          pl.attackGunDir = pl.gundir;
        }
        pl.attack = input.fire;
        if (!pl.attackOnce) pl.attackGunDir = pl.gundir;
        this.sim.setDropKey(pl.pid, input.dropFlag);
        continue;
      }
      if (time >= (this.nextTurn.get(pl.pid) ?? 0)) {
        this.nextTurn.set(pl.pid, time + 0.5 + Math.random() * 1.5);
        const dirs = [CONTROL.up, CONTROL.down, CONTROL.left, CONTROL.right];
        let c = dirs[Math.floor(Math.random() * 4)]!;
        if (Math.random() < 0.5) c |= dirs[Math.floor(Math.random() * 4)]!;
        if (Math.random() < 0.4) c |= CONTROL.run;
        pl.controls = c;
        if (!pl.dead) pl.gundir = gunDirectionFromControls(pl.gundir, c);
        pl.attack = this.stress || Math.random() < 0.6;
        pl.attackOnce = pl.attack;
        pl.attackGunDir = pl.gundir;
      }
    }
    if (this.stress)
      for (const pl of world.players)
        if (pl && !pl.dead) {
          pl.weapon = 9;
          pl.energy = 300;
        }
    // a bandeira devolvida pisca por 2 s: lembra quando cada uma voltou à base
    const before = this.flagStatuses();
    this.sim.simulateFrame();
    const after = this.flagStatuses();
    for (const [key, status] of after) if (status === 'base' && before.get(key) !== 'base') this.returnTime.set(key, time);
    world.frame++;
    const out = this.events;
    this.events = [];
    return out;
  }

  private flagStatuses(): Map<string, string> {
    const out = new Map<string, string>();
    for (const team of [0, 1, 2] as const) this.world.flagsOf(team).forEach((f, i) => out.set(`${team}.${i}`, f.status));
    return out;
  }

  /** Passa o jogador local para os controles do teclado/gamepad. */
  setMyInput(input: { controls: number; fire: boolean; dropFlag: boolean }): void {
    this.myInput = input;
  }

  /** Delete: suicídio (bloqueado sob efeito de deathbringer, como no servidor). */
  suicide(): void {
    const pl = this.world.players[this.me];
    if (pl && !pl.dead && !pl.underDeathbringerEffect(this.world.time)) this.sim.suicide(this.me);
  }

  /** Posição do jogador seguido pela câmera. */
  mePosition(): WorldCoords {
    const pl = this.world.players[this.me];
    return pl ? coords(pl.pos) : { room: { x: 0, y: 0 }, x: 0, y: 0 };
  }

  frame(multiRoom: boolean): EntityFrame {
    const w = this.world;
    const time = w.frame / 10;
    const meTeam = w.players[this.me]?.team ?? 0;
    const players: PlayerView[] = [];
    for (const pl of w.players) {
      if (!pl) continue;
      let alpha = pl.visibility;
      if (pl.team === meTeam) alpha = Math.max(alpha, 128); // `min_alpha_friends`
      players.push({
        pid: pl.pid,
        team: pl.team,
        color: pl.pid % 16,
        name: NAMES[pl.pid % NAMES.length]!,
        pos: coords(pl.pos),
        gundir: pl.gundir,
        dead: pl.dead,
        hitfx: this.hitfx.get(pl.pid) ?? 0,
        power: pl.power,
        turboTrail: pl.turbo && pl.vel.x * pl.vel.x + pl.vel.y * pl.vel.y > this.settings.physics.maxRunSpeed ** 2,
        shield: pl.shield > 0,
        deathbringer: pl.deathbringer,
        deathbringerAffected: pl.underDeathbringerEffect(time),
        alpha,
        frags: pl.stats.frags,
        me: pl.pid === this.me,
        respawnIn: pl.pid === this.me && pl.dead ? pl.framesToRespawn / 10 : 0,
      });
    }
    const rockets: RocketView[] = [];
    for (const rk of w.rockets) {
      if (rk.owner === -1) continue;
      // o original troca os raios aqui (`r.power ? ROCKET_RADIUS : POWER_ROCKET_RADIUS`)
      const radius = rk.power ? 4 : 6;
      const sy = rk.pos.y + radius + 8;
      const room = this.map.rooms[rk.pos.roomX]?.[rk.pos.roomY];
      const shadow = sy < ROOM_HEIGHT && !(room?.fallOnWallCirc(new Vec(rk.pos.x, sy), radius / 2) ?? true);
      rockets.push({ team: rk.team as 0 | 1, power: rk.power, pos: coords(rk.pos), direction: rk.direction, shadow });
    }
    const flags: FlagView[] = [];
    for (const team of [0, 1, 2] as const)
      w.flagsOf(team).forEach((f, i) =>
        flags.push({
          team,
          pos: coords(f.pos),
          carrier: f.carrier,
          flash: time < (this.returnTime.get(`${team}.${i}`) ?? -10) + 2 && Math.trunc((time * 15) % 3) === 0,
          returnIn: team !== 2 && f.status === 'dropped' ? f.dropTime + this.settings.world.flagReturnDelay - time : 0,
        }),
      );
    return {
      time,
      players,
      rockets,
      powerups: w.items.filter((it) => it.isReal()).map((it) => ({ kind: it.kind, pos: coords(it.pos) })),
      flags,
      deathbringers: w.explosions.map((db) => ({ pos: coords(db.pos), team: db.ownerTeam as 0 | 1, radius: db.radius(w.frame) })),
      multiRoom,
    };
  }
}
