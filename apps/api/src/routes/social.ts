// SPDX-License-Identifier: GPL-2.0-or-later
// API social (OG-211, RN-SOC-02/03/04): companheiros e rivais mais frequentes, clã, evolução do
// rating e busca de jogadores. Bots e convidados não entram (sem conta). Privacidade (D-39): quem
// esconde companheiros some também das listas dos outros; quem esconde o histórico não tem série
// nem totais por período publicados (o dono continua vendo os próprios dados).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import { ACCENTED, fold, PLAIN, usernameKey } from '../db/keys.js';
import { playerProfiles, users } from '../db/schema.js';
import { skillValue } from '../skill.js';
import { ErrorSchema } from './schemas.js';

/** Pontos da série de evolução (os mais recentes). */
export const PROGRESS_POINTS = 500;
const LIST_SIZE = 10;
const CACHE_MS = 30_000;
const CACHE_MAX = 2000;

const Name = Type.Object({ name: Type.String({ minLength: 1, maxLength: 32 }) });
const Mate = Type.Object({
  username: Type.String(),
  clanTag: Type.Union([Type.String(), Type.Null()]),
  /** Tag decorada pelo estilo do clã (OG-338). */
  clanLabel: Type.Union([Type.String(), Type.Null()]),
  matches: Type.Integer(),
  wins: Type.Integer(),
  losses: Type.Integer(),
});
/** Adversário no "quem matou quem" (OG-364): abates de um sobre o outro. */
const Duel = Type.Object({
  username: Type.String(),
  clanTag: Type.Union([Type.String(), Type.Null()]),
  clanLabel: Type.Union([Type.String(), Type.Null()]),
  kills: Type.Integer(),
});
const PeriodTotals = Type.Object({
  matches: Type.Integer(),
  wins: Type.Integer(),
  kills: Type.Integer(),
  deaths: Type.Integer(),
  captures: Type.Integer(),
  playSeconds: Type.Integer(),
});

/** Cache curto em memória (respostas públicas; a do dono não entra). */
class ShortCache {
  private readonly map = new Map<string, { at: number; value: unknown }>();
  get<T>(key: string, now = Date.now()): T | undefined {
    const hit = this.map.get(key);
    if (!hit || now - hit.at > CACHE_MS) return undefined;
    return hit.value as T;
  }
  set(key: string, value: unknown, now = Date.now()): void {
    if (this.map.size >= CACHE_MAX) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, { at: now, value });
  }
}

interface Target {
  id: string;
  username: string;
  clanTag: string | null;
  hideCompanions: boolean;
  hideHistory: boolean;
}

export { fold };

/** Escapa `%`, `_` e `\` para um LIKE de prefixo. */
export function likePrefix(text: string): string {
  return `${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function socialRoutes({ database }: AppDeps, { sessions }: Services): FastifyPluginAsyncTypebox {
  const { db } = database;
  const cache = new ShortCache();

  async function target(name: string): Promise<Target | undefined> {
    const [row] = await db
      .select({ id: users.id, username: users.username, clanTag: users.clanTag, hideCompanions: playerProfiles.hideCompanions, hideHistory: playerProfiles.hideHistory })
      .from(users)
      .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id))
      .where(eq(users.usernameKey, usernameKey(name)));
    return row && { ...row, hideCompanions: row.hideCompanions ?? false, hideHistory: row.hideHistory ?? false };
  }
  const isOwner = async (request: FastifyRequest, t: Target) => (await sessions.current(request))?.id === t.id;
  /** Resposta pública em cache; a do dono é sempre calculada (pode ver o que escondeu). */
  async function cached<T>(key: string, owner: boolean, compute: () => Promise<T>): Promise<T> {
    if (owner) return compute();
    const hit = cache.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await compute();
    cache.set(key, value);
    return value;
  }

  return async (app) => {
    app.get(
      '/players/:name/social',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Companheiros e rivais mais frequentes e o clã do jogador',
          params: Name,
          response: {
            200: Type.Object({
              hidden: Type.Boolean(),
              companions: Type.Array(Mate),
              rivals: Type.Array(Type.Intersect([Mate, Type.Object({ draws: Type.Integer(), balance: Type.Integer() })])),
              clan: Type.Union([Type.Object({ tag: Type.String(), members: Type.Array(Type.String()) }), Type.Null()]),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const t = await target(request.params.name);
        if (!t) return reply.code(404).send({ error: 'player_not_found', message: 'player not found' });
        const owner = await isOwner(request, t);
        return cached(`social:${t.id}`, owner, async () => {
          const hidden = t.hideCompanions && !owner;
          const clan = t.clanTag
            ? {
                tag: t.clanTag,
                members: (
                  await db.execute<{ username: string }>(sql`
                    SELECT username FROM users WHERE lower(clan_tag) = lower(${t.clanTag}) ORDER BY username_key LIMIT 50`)
                ).map((r) => r.username),
              }
            : null;
          if (hidden) return { hidden: true, companions: [], rivals: [], clan };
          // resumos de player_pairs (src/social-stats.ts); quem esconde companheiros não aparece aqui
          type Pair = { username: string; clan_tag: string | null; clan_label: string | null; together: number; won_together: number; lost_together: number; against: number; won_against: number; lost_against: number };
          const top = (order: 'together' | 'against') =>
            db.execute<Pair>(sql`
              SELECT u.username, u.clan_tag, u.clan_label, pp.together, pp.won_together, pp.lost_together, pp.against, pp.won_against, pp.lost_against
              FROM player_pairs pp
              JOIN users u ON u.id = pp.other_id
              LEFT JOIN player_profiles pr ON pr.user_id = pp.other_id
              WHERE pp.user_id = ${t.id} AND ${sql.raw(`pp.${order}`)} > 0 AND NOT coalesce(pr.hide_companions, false)
              ORDER BY ${sql.raw(`pp.${order}`)} DESC, u.username_key
              LIMIT ${LIST_SIZE}`);
          const [companions, rivals] = await Promise.all([top('together'), top('against')]);
          return {
            hidden: false,
            companions: companions.map((r) => ({ username: r.username, clanTag: r.clan_tag, clanLabel: r.clan_label, matches: r.together, wins: r.won_together, losses: r.lost_together })),
            rivals: rivals.map((r) => ({
              username: r.username,
              clanTag: r.clan_tag,
              clanLabel: r.clan_label,
              matches: r.against,
              wins: r.won_against,
              losses: r.lost_against,
              draws: r.against - r.won_against - r.lost_against,
              balance: r.won_against - r.lost_against,
            })),
            clan,
          };
        });
      },
    );

    app.get(
      '/players/:name/kills',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Quem matou quem (OG-364): vítimas favoritas e quem mais mata o jogador nas ranqueadas com eventos, no mês ou sempre',
          params: Name,
          querystring: Type.Object({ period: Type.Union([Type.Literal('month'), Type.Literal('all')], { default: 'month' }) }),
          response: {
            200: Type.Object({ hidden: Type.Boolean(), victims: Type.Array(Duel), killers: Type.Array(Duel) }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const t = await target(request.params.name);
        if (!t) return reply.code(404).send({ error: 'player_not_found', message: 'player not found' });
        const owner = await isOwner(request, t);
        const { period } = request.query;
        return cached(`kills:${t.id}:${period}`, owner, async () => {
          // histórico escondido (D-39): só o dono vê
          if (t.hideHistory && !owner) return { hidden: true, victims: [], killers: [] };
          const [victims, killers] = await Promise.all([duels(t.id, 'killer', period), duels(t.id, 'victim', period)]);
          return { hidden: false, victims, killers };
        });
      },
    );

    /**
     * Abates entre o jogador e cada adversário com conta (bots e convidados não entram, RN-SOC-02),
     * dos eventos das ranqueadas (OG-362); `as` = o papel do jogador. Quem esconde companheiros fica fora.
     */
    async function duels(userId: string, as: 'killer' | 'victim', period: 'month' | 'all') {
      const [me, other] = as === 'killer' ? ['killer', 'victim'] : ['victim', 'killer'];
      const rows = await db.execute<{ username: string; clan_tag: string | null; clan_label: string | null; kills: number }>(sql`
        WITH k AS (
          SELECT e.match_id, (ev ->> 2)::int AS killer, (ev ->> 3)::int AS victim
          FROM match_events e
          JOIN matches m ON m.id = e.match_id
          CROSS JOIN LATERAL jsonb_array_elements(e.events) ev
          WHERE ev ->> 1 = 'kill'
            AND m.ranked -- o perfil segue só com as ranqueadas (os eventos do Casual são do relatório, D-75)
            AND e.match_id IN (SELECT match_id FROM match_event_players WHERE user_id = ${userId})
            ${period === 'month' ? sql`AND m.ended_at >= date_trunc('month', now())` : sql``}
        )
        SELECT u.username, u.clan_tag, u.clan_label, count(*)::int AS kills
        FROM k
        JOIN match_event_players me ON me.match_id = k.match_id AND me.idx = ${sql.raw(`k.${me}`)} AND me.user_id = ${userId}
        JOIN match_event_players mo ON mo.match_id = k.match_id AND mo.idx = ${sql.raw(`k.${other}`)} AND mo.user_id IS NOT NULL AND mo.user_id <> ${userId} AND mo.team <> me.team
        JOIN users u ON u.id = mo.user_id
        LEFT JOIN player_profiles pr ON pr.user_id = mo.user_id
        WHERE NOT coalesce(pr.hide_companions, false)
        GROUP BY u.id, u.username, u.clan_tag, u.clan_label, u.username_key
        ORDER BY kills DESC, u.username_key
        LIMIT ${LIST_SIZE}`);
      return rows.map((r) => ({ username: r.username, clanTag: r.clan_tag, clanLabel: r.clan_label, kills: r.kills }));
    }

    app.get(
      '/players/:name/progress',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Evolução: rating de habilidade após cada ranqueada (OG-351) e totais por período',
          params: Name,
          response: {
            200: Type.Object({
              hidden: Type.Boolean(),
              /** Valor exibido do rating de habilidade após cada ranqueada (RN-SKL-04; as últimas 500). */
              series: Type.Array(Type.Object({ at: Type.String(), value: Type.Integer() })),
              periods: Type.Union([Type.Object({ days7: PeriodTotals, days30: PeriodTotals, all: PeriodTotals }), Type.Null()]),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const t = await target(request.params.name);
        if (!t) return reply.code(404).send({ error: 'player_not_found', message: 'player not found' });
        const owner = await isOwner(request, t);
        return cached(`progress:${t.id}`, owner, async () => {
          if (t.hideHistory && !owner) return { hidden: true, series: [], periods: null };
          const series = (
            await db.execute<{ at: Date | string; mu: number; sigma: number }>(sql`
              SELECT at, mu, sigma FROM (
                SELECT m.ended_at AS at, c.mu_after AS mu, c.sigma_after AS sigma
                FROM skill_changes c JOIN matches m ON m.id = c.match_id
                WHERE c.user_id = ${t.id}
                ORDER BY m.ended_at DESC
                LIMIT ${PROGRESS_POINTS}
              ) last ORDER BY at`)
          ).map((p) => ({ at: new Date(p.at).toISOString(), value: skillValue(p) }));
          // totais por dia (UTC) de player_daily: 7 e 30 dias contam hoje
          const [p] = await db.execute<Record<string, number>>(sql`
            SELECT
              ${periodColumns('d7', sql`day > current_date - 7`)},
              ${periodColumns('d30', sql`day > current_date - 30`)},
              ${periodColumns('all', sql`true`)}
            FROM player_daily WHERE user_id = ${t.id}`);
          const period = (prefix: string) => ({
            matches: p?.[`${prefix}_matches`] ?? 0,
            wins: p?.[`${prefix}_wins`] ?? 0,
            kills: p?.[`${prefix}_kills`] ?? 0,
            deaths: p?.[`${prefix}_deaths`] ?? 0,
            captures: p?.[`${prefix}_captures`] ?? 0,
            playSeconds: p?.[`${prefix}_play`] ?? 0,
          });
          return { hidden: false, series, periods: { days7: period('d7'), days30: period('d30'), all: period('all') } };
        });
      },
    );

    app.get(
      '/directory',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Diretório (OG-215): jogadores mais ativos nos últimos 7 dias (sem quem esconde o histórico) e clãs',
          response: {
            200: Type.Object({
              active: Type.Array(Type.Object({ username: Type.String(), clanTag: Type.Union([Type.String(), Type.Null()]), clanLabel: Type.Union([Type.String(), Type.Null()]), matches: Type.Integer(), wins: Type.Integer(), playSeconds: Type.Integer() })),
              clans: Type.Array(Type.Object({ tag: Type.String(), members: Type.Integer(), activeMembers: Type.Integer(), matches: Type.Integer() })),
            }),
          },
        },
      },
      async () =>
        cached('directory', false, async () => {
          const active = await db.execute<{ username: string; clan_tag: string | null; clan_label: string | null; matches: number; wins: number; play: number }>(sql`
            SELECT u.username, u.clan_tag, u.clan_label, sum(d.matches)::int AS matches, sum(d.wins)::int AS wins, sum(d.play_seconds)::int AS play
            FROM player_daily d JOIN users u ON u.id = d.user_id
            LEFT JOIN player_profiles pr ON pr.user_id = u.id
            WHERE d.day > current_date - 7 AND NOT coalesce(pr.hide_history, false)
            GROUP BY u.id ORDER BY matches DESC, play DESC, u.username_key LIMIT 20`);
          // clãs: membros (contas com a mesma tag, sem diferença de maiúsculas) e atividade na semana
          const clans = await db.execute<{ tag: string; members: number; active: number; matches: number }>(sql`
            SELECT min(u.clan_tag) AS tag, count(*)::int AS members,
              count(w.user_id)::int AS active, coalesce(sum(w.matches), 0)::int AS matches
            FROM users u
            LEFT JOIN (SELECT user_id, sum(matches) AS matches FROM player_daily WHERE day > current_date - 7 GROUP BY user_id) w ON w.user_id = u.id
            WHERE u.clan_tag IS NOT NULL
            GROUP BY lower(u.clan_tag) ORDER BY active DESC, members DESC, lower(u.clan_tag) LIMIT 30`);
          return {
            active: active.map((r) => ({ username: r.username, clanTag: r.clan_tag, clanLabel: r.clan_label, matches: r.matches, wins: r.wins, playSeconds: r.play })),
            clans: clans.map((c) => ({ tag: c.tag, members: c.members, activeMembers: c.active, matches: c.matches })),
          };
        }),
    );

    app.get(
      '/players',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Busca de jogadores pelo começo do nome (mesma comparação do login) ou pelo clã',
          querystring: Type.Object({
            busca: Type.String({ minLength: 1, maxLength: 32 }),
            limit: Type.Integer({ minimum: 1, maximum: 50, default: 20 }),
            offset: Type.Integer({ minimum: 0, maximum: 10_000, default: 0 }),
          }),
          response: {
            200: Type.Object({
              total: Type.Integer(),
              players: Type.Array(Type.Object({ username: Type.String(), clanTag: Type.Union([Type.String(), Type.Null()]), clanLabel: Type.Union([Type.String(), Type.Null()]) })),
            }),
          },
        },
      },
      async (request) => {
        const { busca, limit, offset } = request.query;
        const key = usernameKey(busca);
        // clã sem diferença de maiúsculas e acentos (RN-SOC-04), como o nome
        const clan = fold(busca.trim());
        const clanKey = sql`translate(lower(clan_tag), ${ACCENTED}, ${PLAIN})`;
        const where = key
          ? sql`(username_key LIKE ${likePrefix(key)} OR ${clanKey} = ${clan})`
          : sql`${clanKey} = ${clan}`;
        const [count] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users WHERE ${where}`);
        const rows = await db.execute<{ username: string; clan_tag: string | null; clan_label: string | null }>(sql`
          SELECT username, clan_tag, clan_label FROM users WHERE ${where}
          ORDER BY (username_key = ${key}) DESC, username_key
          LIMIT ${limit} OFFSET ${offset}`);
        return { total: count?.n ?? 0, players: rows.map((r) => ({ username: r.username, clanTag: r.clan_tag, clanLabel: r.clan_label })) };
      },
    );
  };
}

/** Totais de um período como colunas `<prefixo>_matches`, `_wins`, `_kills`, `_deaths`, `_captures`, `_play`. */
function periodColumns(prefix: string, when: SQL) {
  const sum = (col: string, as: string) => sql`coalesce(sum(${sql.raw(col)}) FILTER (WHERE ${when}), 0)::int AS ${sql.raw(`${prefix}_${as}`)}`;
  return sql.join([sum('matches', 'matches'), sum('wins', 'wins'), sum('kills', 'kills'), sum('deaths', 'deaths'), sum('captures', 'captures'), sum('play_seconds', 'play')], sql`, `);
}
