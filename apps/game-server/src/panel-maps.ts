// SPDX-License-Identifier: GPL-2.0-or-later
// Mapas publicados pela moderação (OG-367, D-70): a configuração do heartbeat lista nome e CRC; o
// texto que falta (ou mudou) é baixado da API, validado pelo parser e guardado em memória. Entram nas
// rotações e salas como os da pasta e são servidos ao cliente em `/maps/<nome>.txt`, em Latin-1.
import { parseMapFile } from '@outgun/content';
import type { GameMap } from '@outgun/sim';

export interface PanelMapRef {
  name: string;
  crc: number;
}

export class PanelMaps {
  private readonly maps = new Map<string, { map: GameMap; text: string }>();

  /** `download`: texto do mapa publicado (Latin-1), ou undefined se a API não tem. */
  constructor(private readonly download: (name: string) => Promise<string | undefined>) {}

  map(name: string): GameMap | undefined {
    return this.maps.get(name)?.map;
  }

  text(name: string): string | undefined {
    return this.maps.get(name)?.text;
  }

  /** Algum mapa da lista falta ou mudou de CRC? */
  needs(list: readonly PanelMapRef[]): boolean {
    return list.some((m) => this.maps.get(m.name)?.map.crc !== m.crc);
  }

  /**
   * Fica com os mapas da lista: tira os que saíram e baixa os que faltam. Devolve os que não deu
   * para baixar ou que chegaram diferentes (CRC ou parser): ficam de fora até a próxima tentativa.
   */
  async sync(list: readonly PanelMapRef[]): Promise<string[]> {
    const wanted = new Map(list.map((m) => [m.name, m.crc]));
    for (const name of [...this.maps.keys()]) if (!wanted.has(name)) this.maps.delete(name);
    const failed: string[] = [];
    for (const [name, crc] of wanted) {
      if (this.maps.get(name)?.map.crc === crc) continue;
      const text = await this.download(name).catch(() => undefined);
      const parsed = text === undefined ? undefined : parseMapFile(`${name}.txt`, Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff));
      if (!parsed?.ok || parsed.map.crc !== crc) {
        failed.push(name);
        continue;
      }
      this.maps.set(name, { map: parsed.map, text: text! });
    }
    return failed;
  }
}
