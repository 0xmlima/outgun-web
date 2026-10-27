// SPDX-License-Identifier: GPL-2.0-or-later
// Cards espelhados no Plane (OG-451). O repositório continua sendo a fonte de verdade (seção 10 do
// PLAN e plan/cards/); o Plane só recebe.
//   node tools/dev/plane-sync.mjs [--dry-run] [--prune]
//     cada card vira um item ("OG-NNN — Título", texto do card, external_id = OG-NNN): status → estado,
//     sprint → ciclo (sem datas), épico → módulo, prioridade → urgente/alta/média, pontos → etiqueta
//     "N pts", dependências → "bloqueado por". Roda de novo e só muda o que mudou.
//     --prune apaga o que não veio dos cards (itens de exemplo, estados, ciclos, módulos e etiquetas).
// Chave fora do repositório (público): ~/.config/outgun/plane.env (PLANE_API_KEY, PLANE_WORKSPACE,
// PLANE_PROJECT, PLANE_URL) ou as mesmas variáveis no ambiente.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const PLAN = join(root, 'plan/PLAN.md');
const CARDS = join(root, 'plan/cards');
const SOURCE = 'outgun-cards';
// hash do texto já enviado de cada card: o Plane reescreve o HTML, então comparar com ele não serve
const CACHE = join(homedir(), '.cache/outgun/plane-sync.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const prune = args.includes('--prune');

const envFile = join(homedir(), '.config/outgun/plane.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const { PLANE_API_KEY: KEY, PLANE_WORKSPACE: WS, PLANE_PROJECT: PROJECT } = process.env;
const URL_BASE = process.env.PLANE_URL ?? 'https://api.plane.so';
if (!KEY || !WS || !PROJECT) {
  console.error(`Faltam PLANE_API_KEY, PLANE_WORKSPACE e PLANE_PROJECT (ambiente ou ${envFile}).`);
  process.exit(1);
}
const BASE = `${URL_BASE}/api/v1/workspaces/${WS}/projects/${PROJECT}`;

const STATES = {
  Backlog: { group: 'backlog', color: '#A3A3A3' },
  Pronto: { group: 'unstarted', color: '#3A3A3A' },
  'Em andamento': { group: 'started', color: '#F59E0B' },
  'Em revisão': { group: 'started', color: '#8B5CF6' },
  Bloqueado: { group: 'started', color: '#EF4444' },
  Concluído: { group: 'completed', color: '#16A34A' },
  Cancelado: { group: 'cancelled', color: '#737373' },
  Quebrado: { group: 'cancelled', color: '#0EA5E9' },
};
const PRIORITY = { Must: 'urgent', Should: 'high', Could: 'medium' };

// --- API ---------------------------------------------------------------------------------------

let calls = 0;
async function api(method, path, body) {
  for (;;) {
    calls++;
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const wait = Math.max(5_000, Math.min(120_000, reset - Date.now() + 1_000));
      console.log(`  limite da API: esperando ${Math.round(wait / 1000)} s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok)
      throw new Error(`${method} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? null : res.json();
  }
}
async function list(path) {
  const out = [];
  let cursor = '';
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await api('GET', `${path}${sep}per_page=100${cursor ? `&cursor=${cursor}` : ''}`);
    if (Array.isArray(page)) return page;
    out.push(...page.results);
    if (!page.next_page_results) return out;
    cursor = page.next_cursor;
  }
}
const write = async (method, path, body) => (dryRun ? null : api(method, path, body));

// --- Cards -------------------------------------------------------------------------------------

const plan = readFileSync(PLAN, 'utf8');
const cardFiles = new Map(
  readdirSync(CARDS)
    .filter((f) => /^OG-\d+-.*\.md$/.test(f))
    .map((f) => [f.slice(0, 6), f]),
);

/** Linhas da seção 10: `| [OG-NNN](cards/...) | Título | Épico | Pts | Prio | Sprint | Depende de | Status |`. */
const cards = [];
for (const line of plan.split('\n')) {
  // pontos riscados (~~13~~) nos quebrados; prioridade "Won't (v2)" nos cancelados
  const m =
    /^\| \[(OG-\d+)\]\([^)]*\) \| (.+?) \| (E\d+) \| (?:~~)?(\d+)(?:~~)? \| (.+?) \| (\S+) \| (.+?) \| (.+?) \|$/.exec(
      line,
    );
  if (!m) continue;
  const [, id, title, epic, pts, prio, sprint, deps, status] = m;
  const file = cardFiles.get(id);
  const text = file ? readFileSync(join(CARDS, file), 'utf8') : '';
  cards.push({
    id,
    title,
    epic,
    pts: Number(pts),
    prio,
    sprint: sprint === '—' ? null : sprint,
    deps: deps.match(/OG-\d+/g) ?? [],
    status,
    text,
    file,
  });
}

/** Temas das sprints (seção 9.2) e nomes dos épicos (seção 9.1). */
const sprintTheme = new Map();
const epicName = new Map();
for (const line of plan.split('\n')) {
  const s = /^\| (S\d+) \| (.+?) \| /.exec(line);
  if (s) sprintTheme.set(s[1], s[2]);
  const e = /^\| (E\d+) \| (.+?) \| (.+?) \|$/.exec(line);
  if (e) epicName.set(e[1], { name: e[2].replace(/\*\*v2\*\* — /, ''), goal: e[3] });
}

// --- Markdown do card → HTML do editor do Plane -------------------------------------------------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const repo = 'https://github.com/thiagovasconcellos/outgun-web/blob/v2';
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, label, href) =>
        `<a href="${/^https?:/.test(href) ? href : `${repo}/plan/cards/${href}`}">${label}</a>`,
    );
}
function toHtml(md, file) {
  const out = [
    `<p><a href="${repo}/plan/cards/${file}">plan/cards/${esc(file)}</a> (fonte de verdade no repositório)</p>`,
  ];
  const lines = md.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^# /.test(line)) {
      i++; // o título já é o nome do item
    } else if (/^#{2,4} /.test(line)) {
      const level = Math.min(3, line.indexOf(' '));
      out.push(`<h${level}>${inline(line.replace(/^#+ /, ''))}</h${level}>`);
      i++;
    } else if (/^```/.test(line)) {
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
    } else if (/^\|/.test(line)) {
      const rows = [];
      for (; i < lines.length && /^\|/.test(lines[i]); i++) {
        if (/^\|[\s|:-]+\|$/.test(lines[i])) continue;
        rows.push(
          lines[i]
            .slice(1, -1)
            .split(' | ')
            .map((c) => `<td><p>${inline(c.trim())}</p></td>`)
            .join(''),
        );
      }
      out.push(`<table><tbody>${rows.map((r) => `<tr>${r}</tr>`).join('')}</tbody></table>`);
    } else if (/^\s*- \[[ x]\] /.test(line)) {
      const items = [];
      for (; i < lines.length && /^\s*- \[[ x]\] /.test(lines[i]); i++) {
        const checked = /- \[x\]/.test(lines[i]);
        items.push(
          `<li data-type="taskItem" data-checked="${checked}"><p>${inline(lines[i].replace(/^\s*- \[[ x]\] /, ''))}</p></li>`,
        );
      }
      out.push(`<ul data-type="taskList">${items.join('')}</ul>`);
    } else if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\. /.test(line);
      const items = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i]); i++)
        items.push(`<li><p>${inline(lines[i].replace(/^\s*([-*]|\d+\.) /, ''))}</p></li>`);
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
    } else if (/^> /.test(line)) {
      out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
      i++;
    } else if (line.trim()) {
      const para = [];
      for (
        ;
        i < lines.length && lines[i].trim() && !/^(#|```|\||\s*([-*]|\d+\.) |> )/.test(lines[i]);
        i++
      )
        para.push(lines[i]);
      out.push(`<p>${inline(para.join(' '))}</p>`);
    } else i++;
  }
  return out.join('');
}

// --- Sincronização -----------------------------------------------------------------------------

/** Garante um registro por nome/external_id; devolve Map chave → registro. */
async function ensure(kind, path, wanted, keyOf, create, update) {
  const existing = await list(path);
  const byKey = new Map(existing.map((x) => [keyOf(x), x]));
  for (const [key, body] of wanted) {
    const cur = byKey.get(key);
    if (!cur) {
      console.log(`+ ${kind} ${key}`);
      byKey.set(
        key,
        (await write('POST', path, create(key, body))) ?? { id: `dry-${kind}-${key}`, ...body },
      );
    } else if (update) {
      const diff = update(cur, body);
      if (diff) {
        console.log(`~ ${kind} ${key}`);
        await write('PATCH', `${path}${cur.id}/`, diff);
      }
    }
  }
  if (prune) {
    for (const [key, cur] of byKey) {
      if (wanted.has(key)) continue;
      console.log(`- ${kind} ${key}`);
      await write('DELETE', `${path}${cur.id}/`);
      byKey.delete(key);
    }
  }
  return byKey;
}

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function main() {
  console.log(`${cards.length} cards na seção 10${dryRun ? ' (simulação)' : ''}`);

  // itens primeiro no --prune: os de exemplo prendem estados, ciclos e módulos
  const items = await list('/work-items/');
  const byId = new Map();
  for (const it of items) {
    if (it.external_source === SOURCE && it.external_id) byId.set(it.external_id, it);
    else if (prune) {
      console.log(`- item ${it.sequence_id} ${it.name}`);
      await write('DELETE', `/work-items/${it.id}/`);
    }
  }
  for (const [id, it] of byId) {
    if (prune && !cards.some((c) => c.id === id)) {
      console.log(`- item ${id}`);
      await write('DELETE', `/work-items/${it.id}/`);
      byId.delete(id);
    }
  }

  const states = await ensure(
    'estado',
    '/states/',
    new Map(Object.entries(STATES)),
    (x) => x.name,
    (name, s) => ({ name, ...s }),
    (cur, s) => (cur.group !== s.group || cur.color !== s.color ? s : null),
  );
  const ptsLabels = new Map(
    [...new Set(cards.map((c) => c.pts))].map((p) => [`${p} pts`, { color: '#64748B' }]),
  );
  const labels = await ensure(
    'etiqueta',
    '/labels/',
    ptsLabels,
    (x) => x.name,
    (name, l) => ({ name, ...l }),
  );
  const me = await fetch(`${URL_BASE}/api/v1/users/me/`, { headers: { 'X-API-Key': KEY } }).then(
    (r) => r.json(),
  );
  const sprints = [...new Set(cards.map((c) => c.sprint).filter(Boolean))].sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  );
  const cycles = await ensure(
    'ciclo',
    '/cycles/',
    new Map(
      sprints.map((s) => [
        s,
        {
          name: `${s} — ${sprintTheme.get(s) ?? ''}`.slice(0, 255).replace(/ — $/, '').trim(),
          description: sprintTheme.get(s) ?? '',
        },
      ]),
    ),
    (x) => x.external_id ?? x.name,
    (s, c) => ({
      ...c,
      project_id: PROJECT,
      owned_by: me.id,
      external_id: s,
      external_source: SOURCE,
    }),
    (cur, c) => (cur.name !== c.name || cur.description !== c.description ? c : null),
  );
  const epics = [...new Set(cards.map((c) => c.epic))].sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  );
  const modules = await ensure(
    'módulo',
    '/modules/',
    new Map(
      epics.map((e) => [
        e,
        { name: `${e} — ${epicName.get(e)?.name ?? e}`, description: epicName.get(e)?.goal ?? '' },
      ]),
    ),
    (x) => x.external_id ?? x.name,
    (e, m) => ({ ...m, project_id: PROJECT, external_id: e, external_source: SOURCE }),
    (cur, m) => (cur.name !== m.name || cur.description !== m.description ? m : null),
  );

  // itens
  for (const c of cards) {
    const body = {
      name: `${c.id} — ${c.title}`.slice(0, 255),
      state: states.get(c.status)?.id ?? states.get('Backlog').id,
      priority: PRIORITY[c.prio] ?? 'none',
      labels: [labels.get(`${c.pts} pts`).id],
    };
    const hash = sha(c.text);
    const cur = byId.get(c.id);
    if (!cur) {
      console.log(`+ item ${c.id}`);
      const made = await write('POST', '/work-items/', {
        ...body,
        description_html: toHtml(c.text, c.file),
        external_id: c.id,
        external_source: SOURCE,
      });
      byId.set(c.id, made ?? { id: `dry-${c.id}`, cycle_id: null });
      cache[c.id] = hash;
      continue;
    }
    const diff = {};
    if (cur.name !== body.name) diff.name = body.name;
    if (cur.state !== body.state) diff.state = body.state;
    if (cur.priority !== body.priority) diff.priority = body.priority;
    if (!same(cur.labels ?? [], body.labels)) diff.labels = body.labels;
    if (cache[c.id] !== hash) diff.description_html = toHtml(c.text, c.file);
    if (Object.keys(diff).length) {
      console.log(`~ item ${c.id} (${Object.keys(diff).join(', ')})`);
      await write('PATCH', `/work-items/${cur.id}/`, diff);
      cache[c.id] = hash;
    }
  }

  // ciclos: um item fica num ciclo só; os sem sprint saem do ciclo
  const want = new Map();
  for (const c of cards)
    if (c.sprint) want.set(c.sprint, [...(want.get(c.sprint) ?? []), byId.get(c.id).id]);
  for (const [sprint, cycle] of cycles) {
    const has = String(cycle.id).startsWith('dry-')
      ? []
      : (await list(`/cycles/${cycle.id}/cycle-issues/`)).map((x) => x.id);
    const add = (want.get(sprint) ?? []).filter((id) => !has.includes(id));
    if (add.length) {
      console.log(`  ciclo ${sprint}: +${add.length}`);
      await write('POST', `/cycles/${cycle.id}/cycle-issues/`, { issues: add });
    }
    for (const id of has.filter((id) => !(want.get(sprint) ?? []).includes(id)))
      await write('DELETE', `/cycles/${cycle.id}/cycle-issues/${id}/`);
  }
  // módulos
  for (const [epic, mod] of modules) {
    const wanted = cards.filter((c) => c.epic === epic).map((c) => byId.get(c.id).id);
    const has = String(mod.id).startsWith('dry-')
      ? []
      : (await list(`/modules/${mod.id}/module-issues/`)).map((x) => x.id);
    const add = wanted.filter((id) => !has.includes(id));
    if (add.length) {
      console.log(`  módulo ${epic}: +${add.length}`);
      await write('POST', `/modules/${mod.id}/module-issues/`, { issues: add });
    }
    for (const id of has.filter((id) => !wanted.includes(id)))
      await write('DELETE', `/modules/${mod.id}/module-issues/${id}/`);
  }
  // dependências → "bloqueado por" (só acrescenta)
  for (const c of cards) {
    const deps = c.deps.map((d) => byId.get(d)?.id).filter(Boolean);
    const it = byId.get(c.id);
    if (!deps.length || String(it.id).startsWith('dry-')) continue;
    const rel = await api('GET', `/work-items/${it.id}/relations/`);
    const missing = deps.filter((id) => !(rel.blocked_by ?? []).includes(id));
    if (missing.length) {
      console.log(`  ${c.id} bloqueado por +${missing.length}`);
      await write('POST', `/work-items/${it.id}/relations/`, {
        relation_type: 'blocked_by',
        issues: missing,
      });
    }
  }

  if (!dryRun) {
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  }
  console.log(`pronto: ${calls} chamadas à API`);
}

await main();
