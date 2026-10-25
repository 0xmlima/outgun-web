// SPDX-License-Identifier: GPL-2.0-or-later
// Relatório completo da partida em PDF (OG-425, RN-SOC-08) e da série (OG-426): gerado no navegador,
// A4 retrato, com as mesmas seções da tela. Este módulo (e o jsPDF que ele traz) só é baixado ao
// tocar em "Baixar PDF". `matchReportDoc` monta o conteúdo (puro, testável); `renderReportPdf` desenha.
import { MILESTONES } from '@outgun/content';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { api } from '../app/api.js';
import { APP_VERSION } from '../app/version.js';
import { bestPlayer, captureTimeline, highlights, killMatrix, PLAYER_COLUMNS, seriesResult, TEAM_ROWS, zones, type MatchEvents } from './MatchReport.js';
import { clock, date, duration, signedDelta, type MatchPage, type PlayerLine, type SeriesView } from './stats.js';

type T = (text: string, ...args: string[]) => string;

export interface PdfTable {
  readonly title: string;
  readonly head: readonly string[];
  readonly body: readonly (readonly string[])[];
  /** Time de cada linha: pinta a coluna `nameColumn` (o nome do jogador) de vermelho ou azul. */
  readonly rowTeams?: readonly (number | null)[];
  readonly nameColumn?: number;
  readonly note?: string;
  /** Fonte menor nas tabelas largas (matriz de abates, estatísticas por jogador). */
  readonly small?: boolean;
}

export interface PdfScore {
  readonly red: string;
  readonly blue: string;
  readonly redScore: number;
  readonly blueScore: number;
  readonly redColor: string | null;
  readonly blueColor: string | null;
  readonly result: string;
  readonly notes: readonly string[];
}

/** Uma partida (ou a capa da série): cabeçalho, placar e as seções em ordem. */
export interface ReportDoc {
  /** Sobretítulo: "Relatório da partida" ou "Série". */
  readonly label: string;
  readonly title: string;
  readonly subtitle: string;
  readonly score: PdfScore;
  readonly facts: readonly (readonly [string, string])[];
  readonly tables: readonly PdfTable[];
  readonly link: string;
}

const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export function matchReportDoc(m: MatchPage, events: MatchEvents | null, t: T, locale: string, origin: string): ReportDoc {
  const d = m.details;
  const { redScore, blueScore } = m.match;
  const side = (team: 0 | 1) => m.teams?.[team] ?? null;
  const short = (team: 0 | 1) => side(team)?.tag ?? t(team === 0 ? 'Red' : 'Blue');
  const long = (team: 0 | 1) => side(team)?.tag ?? t(team === 0 ? 'Red team' : 'Blue team');
  const winner =
    redScore === blueScore ? t('Draw') : side(redScore > blueScore ? 0 : 1) ? t('$1 wins', short(redScore > blueScore ? 0 : 1)) : redScore > blueScore ? t('Red team wins') : t('Blue team wins');
  const seconds = (Date.parse(m.match.endedAt) - Date.parse(m.match.startedAt)) / 1000;
  const skill = new Map((m.skill ?? []).map((c) => [c.username, c]));
  const chance = ([0, 1] as const).map((team) => (m.skill ?? []).find((c) => c.team === team)?.winChance);
  const best = bestPlayer(m.players);
  const minutes = (frames: number) => `${Math.trunc(frames / 600)} min`;
  const mode = m.match.mode === 'ranked' ? t('Ranked') : t('Casual');

  const notes: string[] = [];
  if (m.match.mode === 'ranked' && !m.match.ranked) notes.push(t('did not count for the ranking'));
  if (m.match.clanWar) notes.push(m.clans ? `${t('Clan vs clan')} · ${m.clans.red.tag} x ${m.clans.blue.tag}` : t('Clan vs clan'));
  if (m.match.withBots) notes.push(t('Completed with bots'));
  if (m.match.shortHanded) notes.push(t('Short-handed'));
  if (chance[0] !== undefined && chance[1] !== undefined)
    notes.push(t('Predicted win chance: red $1% · blue $2%', String(Math.round(100 * chance[0])), String(Math.round(100 * chance[1]))));

  const facts: [string, string][] = [
    [t('Map'), d.mapTitle ?? m.match.map],
    [t('Mode'), m.format ? `${mode} ${m.format}` : mode],
    [t('Date'), date(m.match.endedAt, locale)],
    [t('Duration'), duration(seconds)],
  ];
  if (m.series && m.series.bestOf > 1 && m.gameNo) facts.push([t('Series'), t('Game $1 of $2', String(m.gameNo), String(m.series.bestOf))]);
  if (d.rules) {
    const r = d.rules;
    facts.push([t('Capture limit'), r.captureLimit === 0 ? t('none') : `${r.captureLimit}${r.winScoreDifference > 1 ? ` (${t('difference of $1', String(r.winScoreDifference))})` : ''}`]);
    facts.push([t('Time limit'), r.timeLimit === 0 ? t('none') : minutes(r.timeLimit)]);
    if (r.timeLimit !== 0)
      facts.push([t('Extra time'), r.extraTime === 0 ? t('none') : `${r.extraTimePeriods > 1 ? `${r.extraTimePeriods}x` : ''}${minutes(r.extraTime)}${r.suddenDeath ? ` (${t('sudden death')})` : ''}`]);
  }
  if (best) facts.push([t('Best player'), best.name]);
  facts.push([t('Game version'), APP_VERSION]);

  const tables: PdfTable[] = [];
  const top = highlights(m.players);
  if (top.length > 0) tables.push({ title: t('Highlights'), head: ['', t('Player'), ''], body: top.map((h) => [t(h.label), h.player.name, String(h.value)]), rowTeams: top.map((h) => h.player.team), nameColumn: 1 });

  const rating = (p: PlayerLine) => {
    const c = p.username ? skill.get(p.username) : undefined;
    return c ? `${signedDelta(c.after - c.before)} (${c.after})` : '-';
  };
  for (const team of [0, 1] as const) {
    const players = m.players.filter((p) => p.team === team);
    tables.push({
      title: `${long(team)} · ${team === 0 ? redScore : blueScore}`,
      head: [t('Player'), t('Frags'), t('Kills'), t('Deaths'), t('Captures'), t('Assists'), t('Effective damage'), t('Defenses'), t('Kills by zone'), t('Accuracy'), t('Flags returned'), ...(skill.size > 0 ? [t('Rating')] : [])],
      body: players.map((p) => [
        p === best ? `${p.name} *` : p.name,
        cell(p.frags),
        cell(p.kills),
        cell(p.deaths),
        cell(p.captures),
        cell(p.stats.assists ?? 0),
        p.stats.effectiveDamage === undefined ? '-' : String(Math.round(p.stats.effectiveDamage)),
        cell(p.stats.defenses ?? '-'),
        zones(p),
        `${Math.round(100 * (p.stats.accuracy ?? 0))}%`,
        cell(p.stats.flagsReturned ?? 0),
        ...(skill.size > 0 ? [rating(p)] : []),
      ]),
      rowTeams: players.map(() => team),
      note: best && players.includes(best) ? `* ${t('Best player')} · ${t('Kills by zone: enemy base · midfield · own base.')}` : t('Kills by zone: enemy base · midfield · own base.'),
      small: true,
    });
  }

  const timeline = captureTimeline(d.captures ?? [], d.baseScore);
  tables.push({
    title: t('Captures'),
    head: [t('Time'), t('Team'), t('Player'), t('Score')],
    body: timeline.length === 0 ? [[t('No captures.'), '', '', '']] : timeline.map((c) => [clock(c.time), short(c.team), `${c.capturer}${c.assistant ? ` + ${c.assistant}` : ''}`, `${c.red}-${c.blue}`]),
    rowTeams: timeline.map((c) => c.team),
    nameColumn: 1,
  });

  if (d.teams)
    tables.push({ title: t('Team stats'), head: [t('Team'), short(0), short(1)], body: TEAM_ROWS.map(([label, value]) => [t(label), cell(value(d.teams![0] ?? {})), cell(value(d.teams![1] ?? {}))]) });

  if (events?.events) {
    const k = killMatrix(events);
    tables.push({
      title: t('Kills by victim'),
      head: [t('Player'), ...k.names],
      body: k.kills.map((row, i) => [k.names[i]!, ...row.map((n, v) => (v === i ? '-' : n ? String(n) : ''))]),
      rowTeams: k.teams,
      note: t('Row = killer, column = victim.'),
      small: true,
    });
  }

  // estatísticas completas por jogador, transpostas (um time por tabela: as colunas são os jogadores)
  for (const team of [0, 1] as const) {
    const players = m.players.filter((p) => p.team === team);
    if (players.length === 0) continue;
    tables.push({
      title: `${t('Player stats')} · ${long(team)}`,
      head: ['', ...players.map((p) => p.name)],
      body: PLAYER_COLUMNS.map(([label, value]) => [t(label), ...players.map((p) => cell(value(p)))]),
      small: true,
    });
  }

  if (m.milestones && m.milestones.length > 0) {
    const l = locale === 'pt-BR' ? 'pt-BR' : 'en';
    tables.push({
      title: t('Milestones'),
      head: [t('Player'), t('Milestones')],
      body: m.milestones.map((x) => [x.username, x.secretName ? `${t('Secret milestone')}: ${x.secretName[l]}` : (MILESTONES.find((s) => s.id === x.milestone)?.name[l] ?? x.milestone)]),
    });
  }

  if (m.series) tables.push(seriesTable(m.series, t, m.match.id));

  return {
    label: t('Match report'),
    title: d.mapTitle ?? m.match.map,
    subtitle: [mode, m.format, date(m.match.endedAt, locale)].filter(Boolean).join(' · '),
    score: { red: short(0), blue: short(1), redScore, blueScore, redColor: side(0)?.color ?? null, blueColor: side(1)?.color ?? null, result: winner, notes },
    facts,
    tables,
    link: `${origin}/matches/${m.match.id}`,
  };
}

function seriesTable(s: SeriesView, t: T, current?: string): PdfTable {
  return {
    title: `${t('Series')} · ${s.format} · ${s.bestOf === 1 ? t('Single game') : t('Best of $1', String(s.bestOf))}`,
    head: [t('Game'), t('Map'), t('Score')],
    body: s.matches.map((g) => [`${t('Game $1', String(g.gameNo ?? '?'))}${g.id === current ? ' *' : ''}`, g.mapTitle, `${g.redScore}-${g.blueScore}`]),
    note: seriesResult(s, t),
  };
}

/** Capa do PDF da série (OG-426): resultado e o resumo de cada jogo; as partidas vêm depois. */
export function seriesCoverDoc(s: SeriesView, t: T, locale: string, origin: string): ReportDoc {
  return {
    label: t('Series'),
    title: `${t('Series')} ${s.format}`,
    subtitle: `${date(s.startedAt, locale)} · ${s.bestOf === 1 ? t('Single game') : t('Best of $1', String(s.bestOf))}`,
    score: { red: t('Red'), blue: t('Blue'), redScore: s.redWins, blueScore: s.blueWins, redColor: null, blueColor: null, result: seriesResult(s, t), notes: [] },
    facts: [
      [t('Date'), date(s.startedAt, locale)],
      [t('Games of the series'), String(s.matches.length)],
    ],
    tables: [seriesTable(s, t)],
    link: `${origin}/series/${s.id}`,
  };
}

/** Só o que as fontes padrão do PDF (WinAnsi) desenham: traços e aspas tipográficas viram ASCII. */
export function pdfText(text: string): string {
  return text
    .replace(/[‒-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^ -ÿ]/g, '?');
}

const INK: [number, number, number] = [20, 24, 36];
const MUTED: [number, number, number] = [96, 104, 120];
const RED: [number, number, number] = [198, 40, 40];
const BLUE: [number, number, number] = [21, 101, 192];
const ACCENT: [number, number, number] = [255, 196, 0];

function rgb(hex: string | null, fallback: [number, number, number]): [number, number, number] {
  const m = hex && /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return fallback;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Desenha as partidas (e a capa da série) em sequência, cada uma começando numa página nova. */
export function renderReportPdf(docs: readonly ReportDoc[], t: T, compress = true): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 14;
  const lastY = () => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  pdf.setProperties({ title: pdfText(docs[0]?.title ?? 'Outgun'), creator: `Outgun ${APP_VERSION}` });
  const links: string[] = [];

  docs.forEach((doc, index) => {
    if (index > 0) pdf.addPage();
    const first = pdf.getNumberOfPages();
    let y = M;
    pdf.setFillColor(...ACCENT);
    pdf.rect(M, y, 3, 12, 'F');
    pdf.setTextColor(...MUTED);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(pdfText(`OUTGUN · ${doc.label.toUpperCase()}`), M + 6, y + 4);
    pdf.setTextColor(...INK);
    pdf.setFontSize(18);
    pdf.text(pdfText(doc.title), M + 6, y + 11);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...MUTED);
    pdf.text(pdfText(doc.subtitle), W - M, y + 11, { align: 'right' });
    y += 22;

    // placar
    const s = doc.score;
    pdf.setDrawColor(210, 214, 222);
    pdf.roundedRect(M, y, W - 2 * M, 24 + 4 * s.notes.length, 2, 2, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(...rgb(s.redColor, RED));
    pdf.text(pdfText(s.red), W / 2 - 20, y + 11, { align: 'right' });
    pdf.setTextColor(...rgb(s.blueColor, BLUE));
    pdf.text(pdfText(s.blue), W / 2 + 20, y + 11);
    pdf.setTextColor(...INK);
    pdf.setFontSize(22);
    pdf.text(`${s.redScore} - ${s.blueScore}`, W / 2, y + 12, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(pdfText(s.result), W / 2, y + 19, { align: 'center' });
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    s.notes.forEach((n, i) => pdf.text(pdfText(n), W / 2, y + 23 + 4 * i, { align: 'center' }));
    y += 30 + 4 * s.notes.length;

    // ficha (duas colunas)
    autoTable(pdf, {
      startY: y,
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: 1.2, textColor: INK },
      columnStyles: { 0: { textColor: MUTED, cellWidth: 32 }, 2: { textColor: MUTED, cellWidth: 32 } },
      body: pairs(doc.facts).map((r) => r.map(pdfText)),
    });
    y = lastY() + 4;

    for (const table of doc.tables) {
      if (y > H - 40) {
        pdf.addPage();
        y = M;
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...INK);
      pdf.text(pdfText(table.title), M, y + 4);
      // números à direita (cabeçalho junto): colunas em que toda célula preenchida é número, placar ou "-"
      const numeric = table.head.map((_, i) => i > 0 && table.body.every((r) => !r[i] || /^[-+±]?[\d.,]*\d?(%| u| \(\d+\))?$|^\d+-\d+$|^\d+:\d\d$/.test(r[i]!)));
      autoTable(pdf, {
        startY: y + 6,
        margin: { left: M, right: M, bottom: 16 },
        theme: 'grid',
        head: [table.head.map(pdfText)],
        body: table.body.map((r) => r.map(pdfText)),
        styles: { fontSize: table.small ? 6.5 : 8.5, cellPadding: table.small ? 1 : 1.5, textColor: INK, lineColor: [220, 224, 230], lineWidth: 0.1, overflow: 'linebreak' },
        headStyles: { fillColor: [236, 239, 244], textColor: INK, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 249, 251] },
        didParseCell: (c) => {
          if (numeric[c.column.index]) c.cell.styles.halign = 'right';
          if (c.section === 'body' && c.column.index === (table.nameColumn ?? 0)) {
            const team = table.rowTeams?.[c.row.index];
            if (team === 0) c.cell.styles.textColor = RED;
            if (team === 1) c.cell.styles.textColor = BLUE;
          }
        },
      });
      y = lastY() + 2;
      if (table.note) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...MUTED);
        const lines = pdf.splitTextToSize(pdfText(table.note), W - 2 * M) as string[];
        pdf.text(lines, M, y + 3);
        y += 3.5 * lines.length;
      }
      y += 6;
    }
    for (let p = first; p <= pdf.getNumberOfPages(); p++) links[p] = doc.link;
  });

  // rodapé: o link da página e a paginação
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...MUTED);
    const link = links[p] ?? '';
    pdf.textWithLink(pdfText(link), M, H - 8, { url: link });
    pdf.text(pdfText(t('Page $1 of $2', String(p), String(pages))), W - M, H - 8, { align: 'right' });
  }
  return pdf;
}

function pairs(facts: readonly (readonly [string, string])[]): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < facts.length; i += 2) rows.push([facts[i]![0], facts[i]![1], facts[i + 1]?.[0] ?? '', facts[i + 1]?.[1] ?? '']);
  return rows;
}

/** Baixa o PDF; no app desktop o Electron abre o diálogo de salvar do sistema. */
export function savePdf(pdf: jsPDF, filename: string): void {
  const url = URL.createObjectURL(pdf.output('blob'));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `outgun-partida-<id>-<aaaa-mm-dd>.pdf` (OG-425) / `outgun-serie-...` (OG-426). */
export function pdfFilename(kind: 'match' | 'series', id: string, when: string): string {
  return `outgun-${kind === 'match' ? 'partida' : 'serie'}-${id}-${when.slice(0, 10)}.pdf`;
}

/** "Baixar PDF" no relatório da partida (OG-425). */
export async function saveMatchPdf(m: MatchPage, events: MatchEvents | null, t: T, locale: string): Promise<void> {
  const pdf = renderReportPdf([matchReportDoc(m, events, t, locale, location.origin)], t);
  savePdf(pdf, pdfFilename('match', m.match.id, m.match.endedAt));
}

/** "Baixar PDF" na página da série (OG-426): a capa e o relatório completo de cada jogo, num arquivo só. */
export async function saveSeriesPdf(s: SeriesView, t: T, locale: string): Promise<void> {
  const games = await Promise.all(
    s.matches.map(async (g) => {
      const [page, events] = await Promise.all([api<MatchPage>(`/matches/${encodeURIComponent(g.id)}`), api<MatchEvents>(`/matches/${encodeURIComponent(g.id)}/events`).catch(() => null)]);
      return matchReportDoc(page, events, t, locale, location.origin);
    }),
  );
  const pdf = renderReportPdf([seriesCoverDoc(s, t, locale, location.origin), ...games], t);
  savePdf(pdf, pdfFilename('series', s.id, s.startedAt));
}
