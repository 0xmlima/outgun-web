// SPDX-License-Identifier: GPL-2.0-or-later
// Presets conhecidos pelo game server: os do código e os Casual criados no painel admin (OG-087),
// que chegam na resposta do heartbeat. Uma sala guarda o preset com que foi criada; mudanças no
// painel valem para as salas abertas depois.
import { PRESETS, type Preset } from '@outgun/settings';

let panel: readonly Preset[] = [];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id) ?? panel.find((p) => p.id === id);
}

/** Troca os presets do painel (só Casual, nunca travados, nunca com o id de um preset do código). */
export function setPanelPresets(list: readonly { id: string; description: string; overrides: string }[]): void {
  panel = list.filter((p) => !PRESETS.some((c) => c.id === p.id)).map((p) => ({ id: p.id, mode: 'casual', locked: false, description: p.description, overrides: p.overrides }));
}
