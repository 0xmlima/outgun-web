// SPDX-License-Identifier: GPL-2.0-or-later
// Tabela do design system v2 (OG-200): rolagem horizontal própria no celular e, com `onRowActivate`,
// linhas navegáveis por ↑/↓/Home/End e ativadas com Enter ou clique (ranking, salas, partidas).
import { useRef, useState, type ReactNode } from 'react';
import { isPhone } from '../app/phone.js';
import { rovingKey } from './keys.js';

export interface Column<Row> {
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: Row) => ReactNode;
  readonly align?: 'start' | 'end';
  /** Some no celular (OG-421): colunas secundárias ou que levam à partida (replay). */
  readonly hideOnPhone?: boolean;
}

interface TableProps<Row> {
  /** Título acessível (vai no `<caption>`, visível só para leitores de tela). */
  readonly caption: string;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly onRowActivate?: (row: Row) => void;
  /** Mostrado no lugar das linhas quando não há nenhuma. */
  readonly empty?: ReactNode;
  /** No celular, cada linha vira uma ficha (rótulo e valor) em vez da tabela (OG-427: moderação). */
  readonly phoneCards?: boolean;
}

export function Table<Row>({ caption, columns: all, rows, rowKey, onRowActivate, empty, phoneCards = false }: TableProps<Row>) {
  const phone = isPhone();
  const columns = phone ? all.filter((c) => !c.hideOnPhone) : all;
  const [current, setCurrent] = useState(0);
  const refs = useRef<(HTMLTableRowElement | null)[]>([]);
  const interactive = onRowActivate !== undefined;
  const focusRow = Math.min(current, rows.length - 1);
  if (phone && phoneCards)
    return (
      <ul className="ui-table-cards" aria-label={caption}>
        {rows.length === 0 && empty !== undefined && <li className="ui-table-empty">{empty}</li>}
        {rows.map((row) => (
          <li key={rowKey(row)} className={interactive ? 'interactive' : undefined} onClick={interactive ? () => onRowActivate(row) : undefined}>
            {columns.map((c) =>
              c.header === '' ? (
                <div key={c.key} className="ui-table-card-actions">
                  {c.cell(row)}
                </div>
              ) : (
                <div key={c.key} className="ui-table-card-pair">
                  <span className="ui-muted">{c.header}</span>
                  <span>{c.cell(row)}</span>
                </div>
              ),
            )}
          </li>
        ))}
      </ul>
    );
  return (
    <div className="ui-table-wrap">
      <table className={interactive ? 'ui-table interactive' : 'ui-table'}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === 'end' ? 'end' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          onKeyDown={(ev) => {
            if (!interactive) return;
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              const row = rows[focusRow];
              if (row) onRowActivate(row);
              return;
            }
            const next = rovingKey(rows.map(() => ({})), focusRow, ev.key, 'vertical');
            if (next === null) return;
            ev.preventDefault();
            setCurrent(next);
            refs.current[next]?.focus();
          }}
        >
          {rows.length === 0 && empty !== undefined && (
            <tr>
              <td className="ui-table-empty" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, index) => (
            <tr
              key={rowKey(row)}
              ref={(el) => {
                refs.current[index] = el;
              }}
              tabIndex={interactive ? (index === focusRow ? 0 : -1) : undefined}
              onFocus={interactive ? () => setCurrent(index) : undefined}
              onClick={interactive ? () => onRowActivate(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'end' ? 'end' : undefined}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
