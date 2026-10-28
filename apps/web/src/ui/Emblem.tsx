// SPDX-License-Identifier: GPL-2.0-or-later
// Emblema do clã (OG-483, RN-EMB-01): o SVG único do protocolo (`emblemSvg`), em qualquer tamanho.
import { DEFAULT_EMBLEM, emblemSvg, type ClanEmblem } from '@outgun/protocol';

export interface EmblemClan {
  readonly tag: string;
  readonly colors?: { readonly primary: string; readonly secondary: string } | null;
  /** Ausente nas respostas antigas: o padrão. */
  readonly emblem?: ClanEmblem | null;
}

export function Emblem({ clan, emblem, size = 32, title }: { readonly clan: EmblemClan; readonly emblem?: ClanEmblem; readonly size?: number; readonly title?: string }) {
  const svg = emblemSvg(emblem ?? clan.emblem ?? DEFAULT_EMBLEM, clan.tag, clan.colors?.primary ?? null, clan.colors?.secondary ?? null);
  return (
    <span
      className="ui-emblem"
      style={{ width: size, height: size }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      // SVG gerado pelo protocolo a partir de listas fechadas; a tag é escapada lá.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
