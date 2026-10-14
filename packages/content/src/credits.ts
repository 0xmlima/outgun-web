// SPDX-License-Identifier: GPL-2.0-or-later
/**
 * Créditos do Outgun original, transcritos de README.txt (seção CREDITS). Exibidos na tela de
 * créditos do cliente web (OG-060). Autores de cada mapa vêm do comando `P author` dos arquivos de
 * mapa (OG-010). E-mails do README foram omitidos de propósito.
 */
export interface CreditGroup {
  readonly role: string;
  readonly people: readonly string[];
}

export const ORIGINAL_CREDITS: readonly CreditGroup[] = [
  {
    role: 'Programming for 0.5.0',
    people: ['Fabiana Cecin (Spinal)', 'Random Name Routine by Renato Hentschke'],
  },
  {
    role: 'Programming for 1.0',
    people: [
      'Niko Ritari (Nix)',
      'Jani Rivinoja (Huntta)',
      'Special player collision effects by Fabiana Cecin',
      'Bots by Peter Kosyh (Gloomy), with modifications by Niko Ritari',
    ],
  },
  {
    role: 'Graphics themes',
    people: [
      'Jani Rivinoja',
      'Joonas Rivinoja',
      'Thomaz de Oliveira dos Reis (ThOR27)',
      'Renato Felix and Thales Zajdsznajder',
    ],
  },
  { role: 'Fonts', people: ['Jani Rivinoja'] },
  { role: 'Sound theme', people: ['Visa-Valtteri Pimiä'] },
  {
    role: 'Translations',
    people: [
      'Finnish: Jani Rivinoja and Niko Ritari',
      'Portuguese (BR): Thomaz de Oliveira dos Reis and Caio Monteiro (Nosferatu)',
      'Italian: Alessandro Ferrentino (Lo Scassatore)',
    ],
  },
  {
    role: 'Maps',
    people: [
      'Cebs',
      'coiote',
      'Devil',
      'evilKaioh',
      'Flyer',
      'Gloomy',
      'Huntta',
      'jarule',
      'Kiss',
      'Luque',
      'Nosferatu',
      'PHiN',
      'Rubens',
      'shadow',
      'Slim',
      'Spinal',
      'ThOR27',
      'th3b3st',
    ],
  },
  {
    role: '1.0.0 beta and later bug reports',
    people: [
      'ThOR27',
      'Spinal',
      'Nosferatu',
      'Joonas',
      'PHiN',
      'coiote',
      'rFrota',
      'K4',
      'Zigue',
      'Syrus',
      'Miague',
      'SnoOpY',
    ],
  },
];

/** Créditos do que entrou no Outgun Web depois do port (v2): fonte da interface, música... */
export const WEB_CREDITS: readonly CreditGroup[] = [
  {
    role: 'Interface font',
    people: ['Inter, by Rasmus Andersson (SIL Open Font License 1.1)'],
  },
  {
    // D-38: trilha composta pelo PO; os títulos das faixas vêm do manifesto (OG-220)
    role: 'Music',
    people: ['Thiago Vasconcellos (CC BY-SA 4.0)'],
  },
];

/** Licença do jogo original e do port (COPYING). */
export const LICENSE_SPDX = 'GPL-2.0-or-later';
