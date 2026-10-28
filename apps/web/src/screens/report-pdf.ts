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
import { DEFAULT_EMBLEM, emblemSvg } from '@outgun/protocol';
import { svgCanvas } from '../ui/emblem-image.js';

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
  /** Emblema do lado que virou o clã (OG-485): SVG em `matchReportDoc`, PNG depois de `withEmblemImages`. */
  readonly redEmblem?: string;
  readonly blueEmblem?: string;
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
  /** "Resumo do jogo" (OG-502): lado a lado, nas cores dos lados; ausente na capa da série. */
  readonly summary?: PdfSummary;
}

/** Uma linha do resumo: valores e o texto de cada lado; `lowerIsBetter` destaca o menor. */
export interface PdfSummaryRow {
  readonly label: string;
  readonly red: number;
  readonly blue: number;
  readonly text: readonly [string, string];
  readonly lowerIsBetter?: boolean;
}

export interface PdfSummary {
  /** Nome e cor (`#RRGGBB`) de cada lado: a cor do clã, senão vermelho/azul. */
  readonly sides: readonly [{ readonly name: string; readonly color: string }, { readonly name: string; readonly color: string }];
  /** Barra de cima, em porcentagem (tempo com a bandeira); null sem dado. */
  readonly share: { readonly label: string; readonly red: number; readonly blue: number } | null;
  readonly rows: readonly PdfSummaryRow[];
}

/** Resumo do jogo (OG-502) a partir das estatísticas dos times; linhas sem dado nos dois lados saem. */
export function gameSummary(m: MatchPage, t: T, name: (team: 0 | 1) => string): PdfSummary | undefined {
  const teams = m.details.teams;
  if (!teams) return undefined;
  const v = (team: 0 | 1, key: string) => teams[team]?.[key] ?? 0;
  const int = (n: number) => Math.round(n).toLocaleString('pt-BR');
  const row = (label: string, key: string, format: (n: number) => string = int, lowerIsBetter = false): PdfSummaryRow => ({
    label: t(label),
    red: v(0, key),
    blue: v(1, key),
    text: [format(v(0, key)), format(v(1, key))],
    ...(lowerIsBetter ? { lowerIsBetter } : {}),
  });
  const rows = [
    row('Captures', 'score'),
    row('Kills', 'kills'),
    row('Deaths', 'deaths', int, true),
    row('Flags taken', 'flagsTaken'),
    row('Flags returned', 'flagsReturned'),
    row('Flags dropped', 'flagsDropped', int, true),
    row('Shots', 'shots'),
    row('Hit accuracy', 'accuracy', (n) => `${Math.round(100 * n)}%`),
    row('Shots taken', 'shotsTaken', int, true),
    row('Total movement', 'movement', (n) => `${int(n)} u`),
    row('Suicides', 'suicides', int, true),
  ].filter((r, i) => i === 0 || r.red !== 0 || r.blue !== 0);
  const carry = ([0, 1] as const).map((team) => m.players.filter((p) => p.team === team).reduce((sum, p) => sum + (p.stats['flagCarryingTime'] ?? 0), 0));
  const total = carry[0]! + carry[1]!;
  const share = total > 0 ? { label: t('Time with the flag'), red: Math.round((100 * carry[0]!) / total), blue: 100 - Math.round((100 * carry[0]!) / total) } : null;
  const colour = (team: 0 | 1) => m.teams?.[team]?.color ?? (team === 0 ? '#C62828' : '#1565C0');
  return {
    sides: [
      { name: name(0), color: colour(0) },
      { name: name(1), color: colour(1) },
    ],
    share,
    rows,
  };
}

const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** SVG do emblema de cada lado que virou o clã; partidas antigas, sem emblema gravado, usam o padrão. */
function sideEmblems(m: { readonly teams?: MatchPage['teams'] | undefined }): { redEmblem?: string; blueEmblem?: string } {
  const svg = (team: 0 | 1) => {
    const s = m.teams?.[team];
    return s ? emblemSvg(s.emblem ?? DEFAULT_EMBLEM, s.tag, s.colors?.primary ?? null, s.colors?.secondary ?? null) : undefined;
  };
  const [red, blue] = [svg(0), svg(1)];
  return { ...(red ? { redEmblem: red } : {}), ...(blue ? { blueEmblem: blue } : {}) };
}

/** Troca o SVG dos emblemas por PNG de 512 px (o jsPDF não desenha SVG); falha = sem emblema. */
export async function withEmblemImages(doc: ReportDoc): Promise<ReportDoc> {
  const png = async (svg: string | undefined) => {
    if (!svg) return undefined;
    try {
      return (await svgCanvas(svg, 512)).toDataURL('image/png');
    } catch {
      return undefined;
    }
  };
  const [redEmblem, blueEmblem] = await Promise.all([png(doc.score.redEmblem), png(doc.score.blueEmblem)]);
  const { redEmblem: _r, blueEmblem: _b, ...score } = doc.score;
  return { ...doc, score: { ...score, ...(redEmblem ? { redEmblem } : {}), ...(blueEmblem ? { blueEmblem } : {}) } };
}

export function matchReportDoc(m: MatchPage, events: MatchEvents | null, t: T, locale: string, origin: string): ReportDoc {
  const d = m.details;
  const { redScore, blueScore } = m.match;
  const side = (team: 0 | 1) => m.teams?.[team] ?? null;
  // o nome do clã identifica o lado, como no placar da partida (OG-463); a tag só se faltar o nome
  const clan = (team: 0 | 1) => (side(team) ? side(team)!.name || side(team)!.tag : null);
  const short = (team: 0 | 1) => clan(team) ?? t(team === 0 ? 'Red' : 'Blue');
  const long = (team: 0 | 1) => clan(team) ?? t(team === 0 ? 'Red team' : 'Blue team');
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
  if (m.match.clanWar) notes.push(m.clans ? `${t('Clan vs clan')} · ${m.clans.red.name || m.clans.red.tag} x ${m.clans.blue.name || m.clans.blue.tag}` : t('Clan vs clan'));
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
    score: { red: short(0), blue: short(1), redScore, blueScore, redColor: side(0)?.color ?? null, blueColor: side(1)?.color ?? null, ...sideEmblems(m), result: winner, notes },
    facts,
    tables,
    link: `${origin}/matches/${m.match.id}`,
    ...(() => {
      const summary = gameSummary(m, t, short);
      return summary ? { summary } : {};
    })(),
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
  // clã de cada lado (OG-489): o nome no lugar de vermelho/azul, com o emblema
  const side = (team: 0 | 1) => (s.teams?.[team] ? s.teams[team]!.name || s.teams[team]!.tag : null);
  return {
    label: t('Series'),
    title: `${t('Series')} ${s.format}`,
    subtitle: `${date(s.startedAt, locale)} · ${s.bestOf === 1 ? t('Single game') : t('Best of $1', String(s.bestOf))}`,
    score: {
      red: side(0) ?? t('Red'),
      blue: side(1) ?? t('Blue'),
      redScore: s.redWins,
      blueScore: s.blueWins,
      redColor: s.teams?.[0]?.color ?? null,
      blueColor: s.teams?.[1]?.color ?? null,
      ...sideEmblems(s),
      result: seriesResult(s, t),
      notes: [],
    },
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
/** Cor `#RRGGBB` misturada com o fundo do painel (`amount` 0..1 da cor). */
function shade(colour: [number, number, number], amount: number): [number, number, number] {
  const [r, g, b] = colour;
  return [Math.round(PANEL[0] + (r - PANEL[0]) * amount), Math.round(PANEL[1] + (g - PANEL[1]) * amount), Math.round(PANEL[2] + (b - PANEL[2]) * amount)];
}
const PANEL: [number, number, number] = [31, 34, 38];

/** Cor do lado legível no painel escuro: cores escuras (preto, marinho, vinho) clareiam até aparecer. */
function onPanel(hex: string, fallback: [number, number, number]): [number, number, number] {
  let c = rgb(hex, fallback);
  const lum = ([r, g, b]: [number, number, number]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  for (let i = 0; i < 4 && lum(c) < 0.4; i++) c = c.map((v) => Math.round(v + (255 - v) * 0.35)) as [number, number, number];
  return c;
}
const TRACK: [number, number, number] = [52, 56, 62];
const LIGHT: [number, number, number] = [238, 242, 248];

/** Desenha o "Resumo do jogo" a partir de `y`; devolve o `y` depois do painel. */
function drawSummary(pdf: jsPDF, sum: PdfSummary, score: PdfScore, t: T, M: number, W: number, y: number): number {
  const rowH = 11;
  const h = 20 + (sum.share ? 14 : 0) + rowH * sum.rows.length;
  if (y + h > pdf.internal.pageSize.getHeight() - 16) {
    pdf.addPage();
    y = 16;
  }
  const x0 = M;
  const x1 = W - M;
  const pad = 6;
  pdf.setFillColor(...PANEL);
  pdf.roundedRect(x0, y, x1 - x0, h, 3, 3, 'F');
  // título e os lados (emblema + nome, na cor do lado)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(...LIGHT);
  pdf.text(pdfText(t('Game summary')), W / 2, y + 9, { align: 'center' });
  const emblem = (e: string | undefined) => (e?.startsWith('data:image/png') ? e : undefined);
  const [re, be] = [emblem(score.redEmblem), emblem(score.blueEmblem)];
  pdf.setFontSize(10);
  if (re) pdf.addImage(re, 'PNG', x0 + pad, y + 4, 9, 9);
  if (be) pdf.addImage(be, 'PNG', x1 - pad - 9, y + 4, 9, 9);
  pdf.setTextColor(...onPanel(sum.sides[0].color, RED));
  pdf.text(pdfText(sum.sides[0].name), x0 + pad + (re ? 11 : 0), y + 10);
  pdf.setTextColor(...onPanel(sum.sides[1].color, BLUE));
  pdf.text(pdfText(sum.sides[1].name), x1 - pad - (be ? 11 : 0), y + 10, { align: 'right' });
  let cy = y + 20;
  const full = (team: 0 | 1) => onPanel(sum.sides[team].color, team === 0 ? RED : BLUE);
  // barra de cima: porcentagem de cada lado numa barra só
  if (sum.share) {
    const sh = sum.share;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    for (const [team, value, x, align] of [
      [0, sh.red, x0 + pad, 'left'],
      [1, sh.blue, x1 - pad, 'right'],
    ] as const) {
      pdf.setFillColor(...full(team));
      pdf.roundedRect(align === 'left' ? x : x - 16, cy - 4, 16, 6, 3, 3, 'F');
      pdf.setTextColor(...INK);
      pdf.text(`${value}%`, align === 'left' ? x + 8 : x - 8, cy + 0.2, { align: 'center' });
    }
    pdf.setTextColor(...LIGHT);
    pdf.text(pdfText(sh.label), W / 2, cy + 0.2, { align: 'center' });
    const bw = x1 - x0 - 2 * pad;
    const split = (bw * sh.red) / 100;
    pdf.setFillColor(...full(1));
    pdf.roundedRect(x0 + pad, cy + 4, bw, 4, 2, 2, 'F');
    pdf.setFillColor(...full(0));
    pdf.roundedRect(x0 + pad, cy + 4, Math.max(4, split), 4, 2, 2, 'F');
    if (split > 4 && split < bw - 2) pdf.rect(x0 + pad + split - 2, cy + 4, 2, 4, 'F');
    cy += 14;
  }
  // linhas: valor, rótulo, valor; meia-barra de cada lado crescendo a partir do centro
  const half = (x1 - x0 - 2 * pad - 8) / 2;
  for (const r of sum.rows) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...LIGHT);
    pdf.text(pdfText(r.text[0]), x0 + pad, cy + 1);
    pdf.text(pdfText(r.text[1]), x1 - pad, cy + 1, { align: 'right' });
    pdf.text(pdfText(r.label), W / 2, cy + 1, { align: 'center' });
    const total = r.red + r.blue;
    const lead = r.red === r.blue ? null : (r.red > r.blue) !== Boolean(r.lowerIsBetter) ? 0 : 1;
    for (const team of [0, 1] as const) {
      const start = team === 0 ? x0 + pad : W / 2 + 4;
      pdf.setFillColor(...TRACK);
      pdf.roundedRect(start, cy + 3, half, 2.2, 1.1, 1.1, 'F');
      const len = total > 0 ? (half * (team === 0 ? r.red : r.blue)) / total : 0;
      if (len <= 0) continue;
      pdf.setFillColor(...(lead === null || lead === team ? full(team) : shade(full(team), 0.45)));
      pdf.roundedRect(team === 0 ? start + half - len : start, cy + 3, len, 2.2, 1.1, 1.1, 'F');
    }
    cy += rowH;
  }
  return y + h + 6;
}

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
    // emblemas (OG-485) por fora dos nomes; só PNG (o SVG cru não vai ao PDF)
    const png = (e: string | undefined) => (e?.startsWith('data:image/png') ? e : undefined);
    const red = png(s.redEmblem);
    const blue = png(s.blueEmblem);
    if (red) pdf.addImage(red, 'PNG', W / 2 - 20 - pdf.getTextWidth(pdfText(s.red)) - 12, y + 3, 10, 10);
    if (blue) pdf.addImage(blue, 'PNG', W / 2 + 22 + pdf.getTextWidth(pdfText(s.blue)), y + 3, 10, 10);
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

    // resumo do jogo (OG-502): painel escuro, lado a lado, nas cores dos lados
    if (doc.summary) y = drawSummary(pdf, doc.summary, s, t, M, W, y);

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
/** O PDF pronto, como arquivo: o botão decide se baixa (computador) ou compartilha (celular, OG-501). */
export function pdfFile(pdf: jsPDF, filename: string): File {
  return new File([pdf.output('blob')], filename, { type: 'application/pdf' });
}

export function savePdf(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
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
export async function matchPdf(m: MatchPage, events: MatchEvents | null, t: T, locale: string): Promise<File> {
  const pdf = renderReportPdf([await withEmblemImages(matchReportDoc(m, events, t, locale, location.origin))], t);
  return pdfFile(pdf, pdfFilename('match', m.match.id, m.match.endedAt));
}

/** "Baixar PDF" na página da série (OG-426): a capa e o relatório completo de cada jogo, num arquivo só. */
export async function seriesPdf(s: SeriesView, t: T, locale: string): Promise<File> {
  const games = await Promise.all(
    s.matches.map(async (g) => {
      const [page, events] = await Promise.all([api<MatchPage>(`/matches/${encodeURIComponent(g.id)}`), api<MatchEvents>(`/matches/${encodeURIComponent(g.id)}/events`).catch(() => null)]);
      return withEmblemImages(matchReportDoc(page, events, t, locale, location.origin));
    }),
  );
  const pdf = renderReportPdf([await withEmblemImages(seriesCoverDoc(s, t, locale, location.origin)), ...games], t);
  return pdfFile(pdf, pdfFilename('series', s.id, s.startedAt));
}
