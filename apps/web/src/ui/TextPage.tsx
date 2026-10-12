// SPDX-License-Identifier: GPL-2.0-or-later
// Página de texto longo (ajuda, créditos, licença) com rolagem por teclado: setas, PageUp/PageDown,
// Home/End; Esc volta.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { BitmapText } from './BitmapText.js';
import { wrapText } from './bitmap-font.js';
import { useMenuFont } from './fonts.js';

/** Largura útil do texto em pixels da fonte (tela de 640 do original menos as margens). */
const TEXT_WIDTH = 600;

export function TextLines({ lines }: { lines: readonly string[] }) {
  const font = useMenuFont();
  const wrapped = font ? lines.flatMap((line) => wrapText(font.data, line, TEXT_WIDTH)) : lines;
  return (
    <div className="text-lines">
      {wrapped.map((line, i) =>
        line.trim() === '' ? (
          <div key={i} className="text-gap" />
        ) : (
          <div key={i}>
            <BitmapText text={line} />
          </div>
        ),
      )}
    </div>
  );
}

const SCROLL_KEYS: Readonly<Record<string, (el: HTMLElement) => number>> = {
  ArrowDown: () => 40,
  ArrowUp: () => -40,
  PageDown: (el) => el.clientHeight * 0.9,
  PageUp: (el) => -el.clientHeight * 0.9,
  ' ': (el) => el.clientHeight * 0.9,
  Home: (el) => -el.scrollHeight,
  End: (el) => el.scrollHeight,
};

interface TextPageProps {
  readonly caption: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
}

export function TextPage({ caption, onBack, children }: TextPageProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const onKeyDown = (ev: KeyboardEvent<HTMLElement>) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      onBack();
      return;
    }
    const step = SCROLL_KEYS[ev.key];
    if (step && ev.target === ev.currentTarget) {
      ev.preventDefault();
      ev.currentTarget.scrollBy({ top: step(ev.currentTarget) });
    }
  };
  return (
    <section className="menu text-page" aria-label={caption}>
      <h1 className="menu-caption">
        <BitmapText text={caption} />
      </h1>
      <article ref={ref} className="text-body" tabIndex={0} onKeyDown={onKeyDown}>
        {children}
      </article>
    </section>
  );
}
