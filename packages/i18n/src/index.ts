// SPDX-License-Identifier: GPL-2.0-or-later
/** Idiomas do Outgun original (languages/). */
export const LOCALES = ['en', 'pt-BR', 'fi', 'it'] as const;

export type Locale = (typeof LOCALES)[number];
