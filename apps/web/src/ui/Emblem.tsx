// SPDX-License-Identifier: GPL-2.0-or-later
// Emblema do clã (OG-483, RN-EMB-01): o SVG único do protocolo (`emblemSvg`), em qualquer tamanho.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_EMBLEM, emblemSvg, type ClanEmblem } from '@outgun/protocol';
import { api } from '../app/api.js';

export interface EmblemClan {
  readonly tag: string;
  readonly colors?: { readonly primary: string; readonly secondary: string } | null;
  /** Ausente nas respostas antigas: o padrão. */
  readonly emblem?: ClanEmblem | null;
}

export function Emblem({ clan, emblem, size = 32, title, inline }: { readonly clan: EmblemClan; readonly emblem?: ClanEmblem; readonly size?: number; readonly title?: string; readonly inline?: boolean }) {
  const svg = emblemSvg(emblem ?? clan.emblem ?? DEFAULT_EMBLEM, clan.tag, clan.colors?.primary ?? null, clan.colors?.secondary ?? null);
  return (
    <span
      className={inline ? 'ui-emblem inline' : 'ui-emblem'}
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

// Emblemas pela tag (OG-484): as telas que só têm a tag pedem aqui; os pedidos do mesmo instante
// viram uma chamada a `/clans/emblems` e ficam guardados até a página recarregar ou o clã mudar.
const cache = new Map<string, EmblemClan | null>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
const keyOf = (tag: string) => tag.toLowerCase();

function request(tag: string) {
  const k = keyOf(tag);
  if (cache.has(k) || waiting.has(k)) return;
  waiting.add(k);
  timer ??= setTimeout(() => {
    timer = undefined;
    const tags = [...waiting];
    waiting.clear();
    void api<{ clans: EmblemClan[] }>(`/clans/emblems?tags=${tags.map(encodeURIComponent).join(',')}`)
      .then(({ clans }) => {
        for (const t of tags) cache.set(t, null);
        for (const c of clans) cache.set(keyOf(c.tag), c);
      })
      .catch(() => undefined)
      .finally(() => listeners.forEach((l) => l()));
  }, 0);
}

/** Esquece o emblema guardado (depois de trocar o emblema, as cores ou a tag). */
export function forgetEmblem(tag: string) {
  cache.delete(keyOf(tag));
  listeners.forEach((l) => l());
}

function useEmblemClan(tag: string | null | undefined): EmblemClan | null | undefined {
  const k = tag ? keyOf(tag) : '';
  const subscribe = useCallback((l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  const value = useSyncExternalStore(subscribe, () => (k ? cache.get(k) : null));
  useEffect(() => {
    if (tag) request(tag);
  }, [tag, value]);
  return value;
}

/** O emblema do clã ao lado da tag; nada enquanto carrega ou se o clã não existe mais. */
export function ClanBadge({ tag, size = 16 }: { readonly tag: string | null | undefined; readonly size?: number }) {
  const clan = useEmblemClan(tag);
  return clan ? <Emblem clan={clan} size={size} inline /> : null;
}
