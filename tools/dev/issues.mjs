// SPDX-License-Identifier: GPL-2.0-or-later
// Issues de bug viram cards (OG-432). Usa o `gh` já autenticado na conta do PO.
//   node tools/dev/issues.mjs import --sprint S47 [--dry-run]
//     cada issue aberta com `bug` + `triagem` vira card (template de PLAN 8.7, campo Issue), com linha
//     na seção 10 e na sprint da seção 9.2; comenta o card na issue e troca `triagem` por `card-criado`
//   node tools/dev/issues.mjs close --version 2.47.0 [--dry-run]
//     fecha as issues dos cards `Concluído` com "Corrigido na 2.47.0" e o milestone `2.47.0`
// Lê as issues do formulário do GitHub (.github/ISSUE_TEMPLATE/bug.yml, `### Campo`) e as abertas pelo
// painel do site (apps/api/src/github.ts, `## Campo` e tabela "Onde aconteceu").
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const PLAN = join(root, 'plan/PLAN.md');
const CARDS = join(root, 'plan/cards');
const REPO = process.env.GITHUB_ISSUES_REPO ?? 'thiagovasconcellos/outgun-web';

const args = process.argv.slice(2);
const command = args[0];
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = args.includes('--dry-run');

const gh = (...a) => execFileSync('gh', [...a, '--repo', REPO], { encoding: 'utf8' });
const ghApi = (...a) => execFileSync('gh', ['api', ...a], { encoding: 'utf8' });

/** Campos da issue: seções `##`/`###` e linhas `| Campo | Valor |`. */
function parseIssue(body) {
  const fields = new Map();
  const lines = body.replace(/\r/g, '').split('\n');
  let current = null;
  let buf = [];
  const flush = () => {
    if (current) fields.set(current, buf.join('\n').trim());
    buf = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/[\u2060\u200b]/g, ''); // colado do WhatsApp/Docs: separadores invisíveis
    if (/^---\s*$/.test(line)) {
      flush();
      current = null; // daqui para baixo é a triagem interna do modelo
      continue;
    }
    const h = /^#{2,3}\s+(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      current = h[1];
      continue;
    }
    const row = /^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
    if (row && row[1] !== 'Campo' && !/^-+$/.test(row[1])) fields.set(row[1], row[2]);
    if (current) buf.push(line);
  }
  flush();
  for (const [k, v] of fields) {
    // modelo em Markdown com caixas: fica a opção marcada, sem a explicação
    const ticked = /\[x\]\s*([^:(\n]+)/i.exec(v);
    fields.set(k, v === '_No response_' || v === '—' ? '' : ticked ? ticked[1].trim() : v);
  }
  return fields;
}

const EPIC_BY_AREA = [
  [/partida|hud/i, 'E11'],
  [/lobby|ranque|ranked|série/i, 'E12'],
  [/clã/i, 'E13'],
  [/portal|relatório|pdf|replay|espectador/i, 'E9'],
  [/conta|login|moderação|admin/i, 'E8'],
  [/steam|computador|servidor|conexão/i, 'E7'],
];
const PRIORITY_BY_SEVERITY = { crítico: 'Must', alto: 'Must', médio: 'Should', baixo: 'Could' };

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');

function nextCardId() {
  const ids = readdirSync(CARDS)
    .map((f) => /^OG-(\d+)-/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number);
  return Math.max(...ids) + 1;
}

function cardFor(id, issue, sprint) {
  const f = parseIssue(issue.body ?? '');
  const area = f.get('Área') ?? '';
  const severity = (f.get('Gravidade') ?? '').split(':')[0].trim();
  const epic = EPIC_BY_AREA.find(([re]) => re.test(area))?.[1] ?? 'E11';
  const priority = PRIORITY_BY_SEVERITY[severity.toLowerCase()] ?? 'Should';
  const summary = f.get('Resumo') || issue.title;
  const bare = issue.title.replace(/^\[Bug\]\s*/i, '').replace(/^[^:]+:\s*/, '') || summary;
  const title = bare.charAt(0).toUpperCase() + bare.slice(1);
  const ctx = [
    'Versão',
    'Dispositivo',
    'Navegador e sistema',
    'Sala / mapa',
    'Sala / modo / mapa',
    'Data e hora',
    'Data e hora (com fuso)',
    'Apelido no jogo',
  ]
    .filter((k) => f.get(k))
    .map((k) => `${k}: ${f.get(k)}`)
    .join(' · ');
  const md = `# OG-${id} — ${title}

| Campo | Valor |
|---|---|
| Épico | ${epic} |
| Tipo | Bug |
| Prioridade | ${priority} |
| Estimativa | 2 pts (provisória, estimar no refinamento) |
| Sprint | ${sprint} |
| Status | Backlog |
| Dependências | — |
| Issue | [#${issue.number}](${issue.url}) |
| Regras de negócio | — |
| Skills | \`outgun-card-workflow\` |

## História
Como jogador, quero que isto deixe de acontecer: ${summary}

## Contexto
- Issue #${issue.number} (área: ${area || '—'}; gravidade: ${severity || '—'}; frequência: ${f.get('Frequência') || '—'}).
${ctx ? `- ${ctx}\n` : ''}- Passos: ${(f.get('Passos para reproduzir') || '—').replace(/\n/g, ' ')}
- Esperado: ${f.get('O que eu esperava') || '—'}
- Obtido: ${f.get('O que aconteceu') || '—'}
- Evidências: ${(f.get('Evidências') || '—').replace(/\n/g, ' ')}
- Contorno: ${f.get('Contorno conhecido') || '—'}

## Escopo
- Corrigir a causa; teste que reproduz o caso.

## Critérios de aceite
- [ ] O caso da issue não acontece mais (teste).
- [ ] PO confere.

## Notas de implementação
(preenchido durante a execução)
`;
  return {
    md,
    file: `OG-${id}-${slugify(title)}.md`,
    row: `| [OG-${id}](cards/OG-${id}-${slugify(title)}.md) | ${title.replace(/\|/g, '/')} (issue #${issue.number}) | ${epic} | 2 | ${priority} | ${sprint} | — | Backlog |`,
  };
}

function addToPlan(rows, ids, sprint) {
  let plan = readFileSync(PLAN, 'utf8');
  const lines = plan.split('\n');
  // seção 10: depois da última linha de card
  const last = lines.reduce((at, l, i) => (l.startsWith('| [OG-') ? i : at), -1);
  lines.splice(last + 1, 0, ...rows);
  // seção 9.2: a linha da sprint (criada se não existir, depois da última sprint)
  const at = lines.findIndex((l) => l.startsWith(`| ${sprint} |`));
  const list = ids.map((id) => `OG-${id}`).join(', ');
  if (at !== -1) {
    const cells = lines[at].split(' | ');
    cells[2] = cells[2] && cells[2] !== '' ? `${cells[2]}, ${list}` : list;
    lines[at] = cells.join(' | ');
  } else {
    const lastSprint = lines.reduce((a, l, i) => (/^\| S\d+ \|/.test(l) ? i : a), -1);
    lines.splice(
      lastSprint + 1,
      0,
      `| ${sprint} | v2: rodada de correções (issues do GitHub) | ${list} | |`,
    );
  }
  plan = lines.join('\n');
  writeFileSync(PLAN, plan);
}

function importIssues() {
  const sprint = option('sprint');
  if (!sprint || !/^S\d+$/.test(sprint)) throw new Error('use --sprint SNN');
  const issues = JSON.parse(
    gh(
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      'bug',
      '--label',
      'triagem',
      '--limit',
      '100',
      '--json',
      'number,title,body,url',
    ),
  );
  if (!issues.length) return console.log('nenhuma issue aberta com bug + triagem');
  let id = nextCardId();
  const made = [];
  for (const issue of issues.sort((a, b) => a.number - b.number)) {
    const card = cardFor(id, issue, sprint);
    console.log(`#${issue.number} → OG-${id} ${card.file}`);
    if (!dryRun) writeFileSync(join(CARDS, card.file), card.md);
    made.push({ id, issue, card });
    id++;
  }
  if (dryRun) return console.log('(dry-run: nada gravado nem comentado)');
  addToPlan(
    made.map((m) => m.card.row),
    made.map((m) => m.id),
    sprint,
  );
  for (const { id: cid, issue } of made) {
    gh(
      'issue',
      'comment',
      String(issue.number),
      '--body',
      `Virou o card OG-${cid} (sprint ${sprint}).`,
    );
    gh(
      'issue',
      'edit',
      String(issue.number),
      '--remove-label',
      'triagem',
      '--add-label',
      'card-criado',
    );
  }
  console.log(
    `${made.length} card(s) criados. Atualize o total de pontos da seção 10 e estime os cards no refinamento.`,
  );
}

function closeIssues() {
  const version = option('version');
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('use --version X.Y.Z');
  const done = [];
  for (const file of readdirSync(CARDS)) {
    const md = readFileSync(join(CARDS, file), 'utf8');
    const issue = /^\| Issue \| \[#(\d+)\]/m.exec(md)?.[1];
    if (!issue || !/^\| Status \| Concluído \|$/m.test(md)) continue;
    done.push({ issue: Number(issue), card: file.slice(0, 6) });
  }
  const open = done.filter(
    (d) => JSON.parse(gh('issue', 'view', String(d.issue), '--json', 'state')).state === 'OPEN',
  );
  if (!open.length) return console.log('nenhuma issue aberta de card concluído');
  for (const d of open) console.log(`fecha #${d.issue} (${d.card}) com milestone ${version}`);
  if (dryRun) return console.log('(dry-run: nada fechado)');
  const milestones = JSON.parse(ghApi(`repos/${REPO}/milestones?state=all&per_page=100`));
  if (!milestones.some((m) => m.title === version))
    ghApi(`repos/${REPO}/milestones`, '-f', `title=${version}`);
  for (const d of open) {
    gh('issue', 'edit', String(d.issue), '--milestone', version);
    gh(
      'issue',
      'close',
      String(d.issue),
      '--reason',
      'completed',
      '--comment',
      `Corrigido na ${version} (card ${d.card}).`,
    );
  }
}

if (command === 'import') importIssues();
else if (command === 'close') closeIssues();
else {
  console.log(
    'uso: node tools/dev/issues.mjs import --sprint SNN [--dry-run] | close --version X.Y.Z [--dry-run]',
  );
  process.exitCode = 1;
}
