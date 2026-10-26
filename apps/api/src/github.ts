// SPDX-License-Identifier: GPL-2.0-or-later
// Issues do GitHub para os relatos de bug do site (OG-430, OG-431): o moderador abre a issue a partir
// do feedback e o jogador acompanha a situação. O token é da conta do PO (fine-grained, só o
// repositório do jogo, permissão Issues). O repositório é público: nada de e-mail, conta ou IP aqui.
import type { BugReport } from './db/schema.js';

export interface IssueRef {
  number: number;
  url: string;
}

export interface IssueState {
  /** open | closed */
  state: string;
  /** completed | not_planned | reopened | null */
  stateReason: string | null;
  /** Título do milestone; na aprovação da sprint vira a versão da correção (OG-432). */
  milestone: string | null;
}

export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

export interface IssueTracker {
  create(draft: IssueDraft): Promise<IssueRef>;
  get(number: number): Promise<IssueState>;
}

/** Cliente da API REST do GitHub; `fetch` injetável nos testes. */
export class GitHubIssues implements IssueTracker {
  constructor(
    private readonly token: string,
    private readonly repo: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async call(path: string, init?: { method: string; body: unknown }): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`https://api.github.com/repos/${this.repo}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'outgun-web',
        ...(init ? { 'content-type': 'application/json' } : {}),
      },
      ...(init ? { body: JSON.stringify(init.body) } : {}),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} em ${path}`);
    return (await res.json()) as Record<string, unknown>;
  }

  async create(draft: IssueDraft): Promise<IssueRef> {
    const j = await this.call('/issues', { method: 'POST', body: draft });
    return { number: j.number as number, url: j.html_url as string };
  }

  async get(number: number): Promise<IssueState> {
    const j = await this.call(`/issues/${number}`);
    const milestone = j.milestone as { title?: string } | null;
    return { state: j.state as string, stateReason: (j.state_reason as string | null) ?? null, milestone: milestone?.title ?? null };
  }
}

const AREAS: Record<string, string> = {
  match: 'Partida / HUD',
  lobby: 'Lobby e salas',
  ranked: 'Ranqueado e séries',
  portal: 'Portal (início, perfil, ranking, hall da fama)',
  clan: 'Clã',
  report: 'Relatório / PDF',
  replay: 'Replay / espectador',
  account: 'Conta e login',
  moderation: 'Moderação / admin',
  desktop: 'Steam / app para computador',
  connection: 'Servidor / conexão',
  other: 'Outro',
};
const FREQUENCY: Record<BugReport['frequency'], string> = { always: 'Sempre', sometimes: 'Às vezes', once: 'Aconteceu uma vez' };
const SEVERITY: Record<BugReport['severity'], [string, string]> = {
  critical: ['Crítico', 'critico'],
  high: ['Alto', 'alto'],
  medium: ['Médio', 'medio'],
  low: ['Baixo', 'baixo'],
};

/** Issue no formato do modelo de bug (`.github/ISSUE_TEMPLATE/bug.yml`). */
export function issueDraft(f: { id: number; username: string; bug: BugReport; context: Record<string, string | number>; createdAt: Date }, webUrl: string): IssueDraft {
  const { bug, context: c } = f;
  const cell = (v: string | number | undefined) => (v === undefined || v === '' ? '—' : String(v).replace(/\|/g, '\\|').replace(/\n/g, ' '));
  const block = (v: string) => v || '—';
  const steps = bug.steps
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => (/^\d+[.)]/.test(l) ? l : `${i + 1}. ${l}`))
    .join('\n');
  const evidence = [bug.evidence, c.match ? `Última partida: ${webUrl}/matches/${c.match}` : ''].filter(Boolean).join('\n');
  const where = [c.room ? `sala ${c.room}` : '', c.map ? `mapa ${c.map}` : ''].filter(Boolean).join(', ');
  const body = `## Resumo
${bug.summary}

## Onde aconteceu
| Campo | Valor |
|---|---|
| Área | ${cell(AREAS[bug.area])} |
| Versão | ${cell(c.version)} |
| Dispositivo | ${cell(c.device)} |
| Navegador e sistema | ${cell([c.client, c.os].filter(Boolean).join(' no '))} |
| Sala / mapa | ${cell(where)} |
| Data e hora | ${cell(c.time ?? f.createdAt.toISOString())}${c.timeZone ? ` (${cell(c.timeZone)})` : ''} |
| Apelido no jogo | ${cell(f.username)} |

## Passos para reproduzir
${block(steps)}

## O que eu esperava
${block(bug.expected)}

## O que aconteceu
${block(bug.actual)}

## Frequência
${FREQUENCY[bug.frequency]}

## Gravidade
${SEVERITY[bug.severity][0]}

## Evidências
${block(evidence)}

## Contorno conhecido
${block(bug.workaround)}

---
Relatado pelo site (feedback #${f.id}).
`;
  return { title: `[Bug] ${AREAS[bug.area]}: ${bug.summary}`.slice(0, 250), body, labels: ['bug', 'triagem', `gravidade:${SEVERITY[bug.severity][1]}`] };
}
