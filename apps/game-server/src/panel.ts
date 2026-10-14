// SPDX-License-Identifier: GPL-2.0-or-later
// Painel admin no game server (OG-087): os comandos chegam na resposta do heartbeat, são executados
// na sala e a confirmação volta no heartbeat seguinte; a configuração (presets Casual e rotações
// por modo) é aplicada quando a versão muda. Rotação nova vale nas salas da plataforma (fixas) a
// partir da próxima troca de mapa e em toda sala aberta depois; salas privadas mantêm a sua.
import type { GameMap } from '@outgun/sim';
import type { CommandAck, HeartbeatReply, PanelHandlers } from './platform.js';
import { setPanelPresets } from './presets.js';
import type { RoomManager } from './rooms.js';

export interface PanelOptions {
  manager: RoomManager;
  /** Rotações usadas pelo spawner (o mesmo objeto: trocar aqui vale para as próximas salas). */
  rotations: Record<'casual' | 'ranked', readonly string[]>;
  map: (file: string) => GameMap | undefined;
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
    for (const mode of ['casual', 'ranked'] as const) {
      const wanted = config.rotations[mode];
      if (!wanted) continue;
      const files = wanted.filter((f) => this.options.map(f));
      if (files.length === 0) {
        this.options.log?.('rotação do painel sem mapas conhecidos: mantida a atual', { mode, wanted });
        continue;
      }
      this.options.rotations[mode] = files;
      for (const h of this.options.manager.hosted()) {
        if (h.persistent && h.mode === mode) this.options.manager.get(h.id)?.setRotation(files.map((file) => ({ file, map: this.options.map(file)! })));
      }
    }
    this.options.log?.('configuração do painel aplicada', { version: config.version, presets: config.presets.length });
  }
}
