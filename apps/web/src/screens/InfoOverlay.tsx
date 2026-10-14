// SPDX-License-Identifier: GPL-2.0-or-later
// Telas F1–F5 sobre a partida (OG-066, spec plan/specs/telas-estatisticas.md): ajuda, lista de mapas
// com voto, estatísticas dos times e dos jogadores, regras do servidor. As teclas de cada tela vêm
// antes do chat e dos controles (`handleInfoScreenKeypress`), como no original.
import { loadManifest } from '../assets.js';
import { catalog } from '@outgun/i18n';
import { PRESETS } from '@outgun/settings';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { usePrefs } from '../app/prefs.js';
import type { GameHost } from '../game/host.js';
import { MAP_SORTS, mapScreen, playerScreen, serverScreen, teamScreen, type InfoScreen, type MapSort } from '../game/hud/info-screens.js';
import { TextLines } from '../ui/TextPage.js';

export type InfoKind = 'help' | 'maps' | 'teams' | 'players' | 'server';

/** Linhas visíveis da lista de mapas e das capturas (o resto rola). */
const MAP_ROWS = 20;
const CAPTURE_ROWS = 10;

interface Props {
  readonly kind: InfoKind;
  readonly host: GameHost | null;
  readonly onClose: () => void;
}

/** "Stats screen alpha" (OG-070): opacidade do fundo das telas F1–F5 (255 = opaco). */
function statsBackground(alpha: number): CSSProperties {
  return { background: `rgba(0, 0, 0, ${(alpha / 255).toFixed(3)})` };
}

export function InfoOverlay({ kind, host, onClose }: Props) {
  const { t, prefs } = usePrefs();
  const [, setTick] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<MapSort>('number');
  const [edit, setEditState] = useState('');
  const editRef = useRef('');
  const setEdit = (v: string) => {
    editRef.current = v;
    setEditState(v);
  };
  const [scroll, setScroll] = useState(0);

  // os dados mudam a cada frame: redesenha 5 vezes por segundo
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setScroll(0), [kind, sort]);

  const session = host?.session() ?? null;
  // mapas do jogo (manifesto de assets), para "Highlight maps not in maps.txt" (OG-070)
  const [knownMaps, setKnownMaps] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    void loadManifest().then((m) => setKnownMaps(new Set(Object.keys(m?.maps ?? {}))));
  }, []);

  useEffect(() => {
    if (!host) return;
    host.setKeyInterceptor((ev) => {
      if (ev.key === 'Escape') {
        onClose();
        return true;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey || /^F\d+$/.test(ev.key)) return false;
      const k = ev.key;
      if (kind === 'maps') {
        const total = host.session()?.mapList.length ?? 0;
        const max = Math.max(0, total - MAP_ROWS);
        const scrollBy = (d: number) => setScroll((v) => Math.min(max, Math.max(0, v + d)));
        if (k === 'ArrowUp') scrollBy(-1);
        else if (k === 'ArrowDown') scrollBy(1);
        else if (k === 'PageUp') scrollBy(-MAP_ROWS);
        else if (k === 'PageDown') scrollBy(MAP_ROWS);
        else if (k === 'Home') setScroll(0);
        else if (k === 'End') setScroll(max);
        else if (k === 'Backspace') setEdit(editRef.current.slice(0, -1));
        else if (k === 'Enter') {
          // número − 1; vazio ou ≥ 255 = sem voto
          const n = Number.parseInt(editRef.current || '0', 10) - 1;
          host.voteMap(n >= 254 ? -1 : n);
          setEdit('');
        } else if (k === ' ' || k === 'ArrowRight' || k === 'ArrowLeft') {
          const d = k === 'ArrowLeft' ? -1 : 1;
          setSort((v) => MAP_SORTS[(MAP_SORTS.indexOf(v) + d + MAP_SORTS.length) % MAP_SORTS.length]!);
        } else if (/^\d$/.test(k)) {
          if (editRef.current.length < 3) setEdit(editRef.current + k);
        }
        else return false;
        return true;
      }
      if (kind === 'players') {
        if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') setPage((p) => Math.max(0, p - 1));
        else if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') setPage((p) => Math.min(3, p + 1));
        else if (k === 'Tab') setPage((p) => (p + (ev.shiftKey ? 3 : 1)) % 4);
        else return false;
        return true;
      }
      if (kind === 'teams') {
        if (k === 'ArrowUp' || k === 'PageUp') setScroll((v) => Math.max(0, v - 1));
        else if (k === 'ArrowDown' || k === 'PageDown') setScroll((v) => v + 1);
        else return false;
        return true;
      }
      return false;
    });
    return () => host.setKeyInterceptor(null);
  }, [host, kind, onClose]);

  if (kind === 'help') {
    return (
      <section className="info-screen help" aria-label={t('Help')}>
        <h2>
          {t('Help')}
        </h2>
        <TextLines lines={catalog(prefs.locale).help} />
      </section>
    );
  }
  if (!session) return null;
  let screen: InfoScreen;
  if (kind === 'maps') screen = mapScreen(session, sort, host?.mapVote() ?? -1, edit, t, prefs.highlightUnknownMaps && knownMaps ? (file) => file !== 'random' && !knownMaps.has(file) : undefined);
  else if (kind === 'teams') screen = teamScreen(session, t);
  else if (kind === 'players') screen = playerScreen(session, page, t);
  else screen = serverScreen(session.settings, PRESETS.find((x) => x.id === session.preset)?.description.split(':')[0] ?? session.preset, t('Server info'), t);

  // rolagem da lista de mapas (tabela 0) e das capturas (tabela 1 de F3)
  const visibleRows = (index: number, rows: InfoScreen['tables'][number]['rows']) => {
    if (kind === 'maps' && index === 0) return rows.slice(scroll, scroll + MAP_ROWS);
    if (kind === 'teams' && index === 1) {
      const start = Math.min(scroll, Math.max(0, rows.length - CAPTURE_ROWS));
      return rows.slice(start, start + CAPTURE_ROWS);
    }
    return rows;
  };
  return (
    <section className={`info-screen ${kind}`} aria-label={screen.title} style={statsBackground(prefs.statsAlpha)}>
      <h2>
        {screen.title}
      </h2>
      {screen.tables.map((table, i) => (
        <table key={i}>
          {table.caption && (
            <caption className={`tone-${table.captionTone ?? 'text'}`}>
              {table.caption}
            </caption>
          )}
          {table.header && (
            <thead>
              <tr>
                {table.header.map((h, j) => (
                  <th key={j}>{h}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {visibleRows(i, table.rows).map((row, r) => (
              <tr key={r} className={`tone-${row.tone}`}>
                {row.cells.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {screen.footer.map((row, i) => (
        <p key={i} className={`tone-${row.tone}`}>
          {row.cells.join(' ')}
        </p>
      ))}
    </section>
  );
}
