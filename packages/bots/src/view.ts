// SPDX-License-Identifier: GPL-2.0-or-later
// O mundo como um bot o enxerga: o `ClientWorld` do cliente virtual (`Robot::fx`, src/world.h:1210),
// montado só com o que chega do servidor (RN-BOT-02). Reaproveita os tipos de estado da sim para que
// a extrapolação use exatamente a física do jogo.
import type { PhysicsSettings } from '@outgun/settings';
import { PlayerState, WorldState, type GameMap, type RoomCoords, type WorldCoords } from '@outgun/sim';

/** `ClientPlayer` (src/world.h:585): o que o cliente sabe de cada jogador. */
export class BotPlayer extends PlayerState {
  used = false;
  name = '';
  /** Na tela do cliente (mesma sala) no último frame recebido. */
  onscreen = false;
  /** Frame da última posição recebida (inclusive a do minimapa); −1e10 = nunca. */
  posUpdated = -1e10;
  fromMinimapUpdate = false;
  /** Se a última posição veio do minimapa: o frame da atualização anterior. */
  prevMapPosUpdateFrame = -1e10;
  prevMapUpdateRoom: RoomCoords = { x: 0, y: 0 };
  /** Preferência anunciada no chat de time ("d"/"a"); usada pelos bots. */
  defending = false;
  defendingAfterDeath = false;
  /** Sob efeito de deathbringer (o cliente só sabe isso, não o tempo). */
  deathbringerAffected = false;

  override underDeathbringerEffect(): boolean {
    return this.deathbringerAffected;
  }

  /** `ClientPlayer::setPosition`. */
  setPosition(roomX: number, roomY: number, x: number, y: number, frame: number, minimapUpdate = false, clearlyVisible = true): void {
    if (this.fromMinimapUpdate) {
      this.prevMapPosUpdateFrame = this.posUpdated;
      this.prevMapUpdateRoom = { x: this.pos.roomX, y: this.pos.roomY };
    }
    this.pos.roomX = roomX;
    this.pos.roomY = roomY;
    this.pos.x = x;
    this.pos.y = y;
    this.fromMinimapUpdate = minimapUpdate;
    if (clearlyVisible) this.posUpdated = frame;
  }

  /** Cópia independente (para `futureMe`). */
  cloneBot(): BotPlayer {
    const c = new BotPlayer(this.pid, this.team);
    Object.assign(c, this);
    c.pos = this.pos.clone();
    c.prevMapUpdateRoom = { ...this.prevMapUpdateRoom };
    return c;
  }
}

/** Regras de bandeira em vigor, como o cliente as recebe (`ClientBase`, src/clientbase.h:113-124). */
export interface BotFlagRules {
  carryOwnTeamFlag: boolean;
  captureAwayFromBase: boolean;
  lockTeamFlags: boolean;
  lockWildFlags: boolean;
  captureOnTeamFlags: boolean;
  captureOnWildFlags: boolean;
  seeMinimapPlayerProperties: number;
}

/** Visão de um bot. `world.players[i]` aponta para `players[i]` quando a vaga está ocupada. */
export class BotView {
  readonly world: WorldState;
  readonly players: BotPlayer[];
  /** `Room::enemies_seen_frame` por sala ([x * altura + y]): última vez que a sala foi vista sem dúvida. */
  readonly enemiesSeenFrame: Float64Array;
  /** Frame do mundo recebido (`fx.frame`). */
  frame = 0;
  physics: PhysicsSettings;
  rules: BotFlagRules;
  /**
   * Bases das bandeiras dos times 0, 1 e selvagens, como no mapa do cliente: bandeiras removidas pelo
   * servidor (`remove_flags`) somem daqui e `random_wild_flag` acrescenta bases.
   */
  bases: [WorldCoords[], WorldCoords[], WorldCoords[]];

  constructor(map: GameMap, maxPlayers: number, physics: PhysicsSettings, rules: BotFlagRules) {
    this.world = new WorldState(map, maxPlayers);
    this.players = Array.from({ length: maxPlayers }, (_, pid) => new BotPlayer(pid, pid < maxPlayers / 2 ? 0 : 1));
    this.enemiesSeenFrame = new Float64Array(map.width * map.height);
    this.physics = physics;
    this.rules = rules;
    this.bases = [[...map.teams[0].flags], [...map.teams[1].flags], [...map.wildFlags]];
  }

  get map(): GameMap {
    return this.world.map;
  }

  get maxPlayers(): number {
    return this.players.length;
  }

  /** Mantém `world.players` (usado pela física) em sincronia com `used`. */
  syncUsed(): void {
    this.players.forEach((p, i) => (this.world.players[i] = p.used ? p : undefined));
  }

  seenIndex(room: RoomCoords): number {
    return room.x * this.map.height + room.y;
  }

  enemiesSeen(roomX: number, roomY: number): number {
     
    return this.enemiesSeenFrame[roomX * this.map.height + roomY]!;
  }

  setEnemiesSeen(roomX: number, roomY: number, frame: number): void {
    this.enemiesSeenFrame[roomX * this.map.height + roomY] = frame;
  }
}
