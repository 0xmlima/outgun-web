// SPDX-License-Identifier: GPL-2.0-or-later
// Página de texto longo (ajuda, créditos, termos) no design system v2 (OG-203): título, voltar com
// Esc e tipografia de leitura. Os textos do original vêm em linhas de largura fixa, alinhadas em
// colunas com espaços; `TextLines` os reestrutura em títulos, parágrafos e listas de duas colunas.
import { useEffect, useRef, type ReactNode } from 'react';
import { Page } from './Page.js';

type Block =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'pairs'; readonly rows: readonly (readonly [string, string])[] }
  | { readonly kind: 'list'; readonly items: readonly string[] };

const PAIR = /^\s+(\S.*?)\s{2,}(\S.*)$/;

/** Reestrutura linhas de texto do original (colunas alinhadas por espaço) em blocos semânticos. */
export function textBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  const nextText = (i: number) => lines.slice(i + 1).find((l) => l.trim() !== '');
  lines.forEach((line, i) => {
    if (line.trim() === '') return;
    const last = blocks.at(-1);
    const pair = PAIR.exec(line);
    if (pair) {
      const row = [pair[1]!, pair[2]!] as const;
      if (last?.kind === 'pairs') blocks[blocks.length - 1] = { kind: 'pairs', rows: [...last.rows, row] };
      else blocks.push({ kind: 'pairs', rows: [row] });
    } else if (/^\s{2,}\S/.test(line)) {
      const item = line.trim();
      if (last?.kind === 'list') blocks[blocks.length - 1] = { kind: 'list', items: [...last.items, item] };
      else blocks.push({ kind: 'list', items: [item] });
    } else if (!line.startsWith(' ') && line.length < 60 && !/[.:]$/.test(line) && nextText(i)?.startsWith(' ')) {
      blocks.push({ kind: 'heading', text: line });
    } else {
      blocks.push({ kind: 'paragraph', text: line.trim() });
    }
  });
  return blocks;
}

export function TextLines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {textBlocks(lines).map((b, i) =>
        b.kind === 'heading' ? (
          <h2 key={i}>{b.text}</h2>
        ) : b.kind === 'paragraph' ? (
          <p key={i}>{b.text}</p>
        ) : b.kind === 'list' ? (
          <ul key={i}>
            {b.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <dl key={i} className="ui-pairs">
            {b.rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ),
      )}
    </>
  );
}

interface TextPageProps {
  readonly caption: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
}

export function TextPage({ caption, onBack, children }: TextPageProps) {
  const ref = useRef<HTMLElement>(null);
  // foco no texto: Esc volta e as setas/PageDown rolam a página sem clicar antes
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <Page title={caption} onBack={onBack}>
      <article ref={ref} className="ui-prose" tabIndex={-1} aria-label={caption}>
        {children}
      </article>
    </Page>
  );
}
