// SPDX-License-Identifier: GPL-2.0-or-later
// Painel admin no game server (OG-087): os comandos chegam na resposta do heartbeat, são executados
// na sala e a confirmação volta no heartbeat seguinte; a configuração (presets Casual e rotações
// por modo) é aplicada quando a versão muda. Rotação nova vale em toda sala do modo a partir da
// próxima troca de mapa (D-69): a sala Casual que escolheu mapas fica com os que seguem na rotação.
import type { GameMap } from '@outgun/sim';
import type { CommandAck, HeartbeatReply, PanelHandlers } from './platform.js';
import { setPanelPresets } from './presets.js';
import { ROTATION_KEYS, rotationKey } from '@outgun/settings';
import { isRotationEntry, panelRotationKeys, resolveRotation, withinRotation, type Rotations } from './maps.js';
import type { GeneratedMaps } from './generated-maps.js';
import type { RoomManager } from './rooms.js';

export interface PanelOptions {
  manager: RoomManager;
  /** Rotações usadas pelo spawner (o mesmo objeto: trocar aqui vale para as próximas salas). */
  rotations: Rotations;
  map: (file: string) => GameMap | undefined;
  /** Para as entradas `random_map` (OG-015). */
  generatedMaps?: GeneratedMaps;
  log?: (line: string, fields?: Record<string, unknown>) => void;
}

export class AdminPanelLink implements PanelHandlers {
  private acks: CommandAck[] = [];
  private configVersion = '';

  constructor(private readonly options: PanelOptions) {}

  takeAcks(): CommandAck[] {
    const out = this.acks;
    this.acks = [];
    return out;
  }

  requeue(acks: CommandAck[]): void {
    this.acks.unshift(...acks);
  }

  onReply(reply: HeartbeatReply): void {
    for (const cmd of reply.commands) {
      const room = this.options.manager.get(cmd.roomId);
      const result = room ? room.remoteCommand(cmd) : { ok: false, text: 'room is closed' };
      this.acks.push({ id: cmd.id, ...result });
      this.options.log?.('comando do painel', { room: cmd.roomId, kind: cmd.kind, actor: cmd.actor, ok: result.ok, ...(result.target ? { target: result.target.name } : {}) });
    }
    if (reply.config.version !== this.configVersion) this.applyConfig(reply.config);
  }

  private applyConfig(config: HeartbeatReply['config']): void {
    this.configVersion = config.version;
    setPanelPresets(config.presets);
    for (const key of ROTATION_KEYS) {
      const wanted = config.rotations[key];
      if (!wanted) continue;
      const slots = resolveRotation(wanted, this.options.map, this.options.generatedMaps);
      const files = wanted.filter((f) => isRotationEntry(f, this.options.map));
      if (slots.length === 0) {
        this.options.log?.('rotação do painel sem mapas conhecidos: mantida a atual', { key, wanted });
        continue;
      }
      this.options.rotations[key] = files;
      panelRotationKeys.add(key);
      // toda sala do modo (Ranked sempre com a rotação oficial do formato, RN-MOD-04; Casual que
      // escolheu mapas fica com os que seguem na rotação, ou a rotação inteira se não sobrar nenhum)
      for (const h of this.options.manager.hosted()) {
        const room = this.options.manager.get(h.id);
        if (!room || rotationKey(h.mode, room.rankedSeries?.format) !== key) continue;
        const chosen = h.mode === 'casual' ? withinRotation(this.options.manager.chosenMaps(h.id) ?? [], files) : [];
        room.setRotation(resolveRotation(chosen.length > 0 ? chosen : files, this.options.map, this.options.generatedMaps));
      }
    }
    this.options.log?.('configuração do painel aplicada', { version: config.version, presets: config.presets.length });
  }
}
