// SPDX-License-Identifier: GPL-2.0-or-later
/** Presets de sala. O Clássico segue config/gamemod.txt (decisão D-01). Implementação: card OG-030. */
export const PRESET_IDS = ['classic'] as const;

export type PresetId = (typeof PRESET_IDS)[number];
