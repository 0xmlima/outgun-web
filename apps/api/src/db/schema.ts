// SPDX-License-Identifier: GPL-2.0-or-later
// Tabelas para o Drizzle. A fonte de verdade é o SQL de migrations/; schema.test.ts confere que as
// duas descrições têm as mesmas colunas.
import { sql } from 'drizzle-orm';
import type { ClanTagStyle } from '@outgun/protocol';
import type { BotNameEntry, RotationKey } from '@outgun/settings';
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const gameMode = pgEnum('game_mode', ['casual', 'ranked']);
export type GameMode = (typeof gameMode.enumValues)[number];
/** Fases do lobby das salas Ranked com formato (OG-252). */
export const LOBBY_PHASES = ['lobby', 'vote', 'ready', 'countdown', 'game', 'finished'] as const;
export type LobbyPhase = (typeof LOBBY_PHASES)[number];
/** Formato do Ranked (OG-250, RN-RKL-01). */
export const rankedFormat = pgEnum('ranked_format', ['3x3', '4x4', '5x5']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    usernameKey: text('username_key').notNull(),
    email: text('email').notNull(),
    emailKey: text('email_key').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** Cópia da tag do clã atual (OG-270), mantida por gatilho; não gravar direto. */
    clanTag: text('clan_tag'),
    /** Tag decorada pelo estilo do clã, "(Dk)", "Dk." (OG-338), mantida por gatilho; não gravar direto. */
    clanLabel: text('clan_label'),
    /** Carência para entrar em outro clã depois de sair ou ser expulso (OG-271, D-47). */
    clanCooldownUntil: tstz('clan_cooldown_until'),
    isAdmin: boolean('is_admin').notNull().default(false),
    /** Moderador (OG-087): salas, denúncias, bans de sala e auditoria no painel. */
    isModerator: boolean('is_moderator').notNull().default(false),
    /** Termos e política aceitos no cadastro (OG-107). */
    termsVersion: text('terms_version'),
    termsAcceptedAt: tstz('terms_accepted_at'),
    usernameChangedAt: tstz('username_changed_at'),
    /** Número no boneco (OG-410, RN-NUM-01): único, 2..99. */
    playerNumber: smallint('player_number'),
    numberChangedAt: tstz('number_changed_at'),
    /** Aviso de que o número vai ser liberado (7 dias antes dos 60 sem jogar). */
    numberWarnedAt: tstz('number_warned_at'),
    /** Líder do mês anterior usando o 1 (opcional, D-79). */
    useNumberOne: boolean('use_number_one').notNull().default(false),
    /** Estilo do número (OG-413): 0 Bloco, 1 Corrida, 2 Contorno, 3 Estêncil. */
    numberStyle: smallint('number_style').notNull().default(0),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_username_key_idx').on(t.usernameKey), uniqueIndex('users_email_key_idx').on(t.emailKey)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const playerProfiles = pgTable('player_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  language: text('language').notNull().default('pt'),
  favoriteColors: smallint('favorite_colors').array().notNull().default(sql`'{}'`),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  rankingParticipation: boolean('ranking_participation').notNull().default(true),
  /** Privacidade do perfil social (OG-211, D-39). */
  hideCompanions: boolean('hide_companions').notNull().default(false),
  hideHistory: boolean('hide_history').notNull().default(false),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  startsAt: tstz('starts_at').notNull(),
  endsAt: tstz('ends_at'),
  active: boolean('active').notNull().default(false),
  /** Mês da temporada mensal (AAAA-MM, Brasília; OG-267); nulo nas antigas. */
  month: text('month'),
});

/** Classificação final de uma temporada encerrada (OG-267, RN-RKL-22). */
export const seasonStandings = pgTable(
  'season_standings',
  {
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    score: doublePrecision('score').notNull(),
    neg: integer('neg').notNull(),
    matches: integer('matches').notNull(),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.userId] }), index('season_standings_position_idx').on(t.seasonId, t.position)],
);

export const rooms = pgTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mode: gameMode('mode').notNull(),
  preset: text('preset').notNull(),
  passwordHash: text('password_hash'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  maxPlayers: smallint('max_players').notNull(),
  persistent: boolean('persistent').notNull().default(false),
  serverId: text('server_id'),
  wsUrl: text('ws_url'),
  players: smallint('players').notNull().default(0),
  map: text('map'),
  lastHeartbeatAt: tstz('last_heartbeat_at'),
  maps: text('maps').array(),
  /** Jogadores na sala, do último heartbeat (painel admin, OG-087). */
  roster: jsonb('roster').$type<RosterEntry[]>().notNull().default([]),
  /** Formato e série da sala Ranked (OG-250); nulos nas salas sem formato. */
  format: rankedFormat('format'),
  bestOf: smallint('best_of'),
  /** Fase do lobby Ranked, do último heartbeat (OG-252); nula nas outras salas. */
  phase: text('phase').$type<LobbyPhase>(),
  /** Bots escolhidos pelo dono da sala privada Casual (OG-289): quantidade e nível (0 = variável). */
  bots: smallint('bots'),
  botLevel: smallint('bot_level'),
  createdAt: tstz('created_at').notNull().defaultNow(),
}, (t) => [index('rooms_server_idx').on(t.serverId)]);

/** Série md1/md3/md5 de uma sala Ranked (OG-250, RN-RKL-02/03): só agrupa jogos; placar por lado. */
export const rankedSeries = pgTable(
  'ranked_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: text('server_id').notNull(),
    serverSeriesId: text('server_series_id').notNull(),
    roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    format: rankedFormat('format').notNull(),
    bestOf: smallint('best_of').notNull(),
    games: smallint('games').notNull().default(0),
    redWins: smallint('red_wins').notNull().default(0),
    blueWins: smallint('blue_wins').notNull().default(0),
    winner: smallint('winner'),
    finishedAt: tstz('finished_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ranked_series_server_idx').on(t.serverId, t.serverSeriesId)],
);

export const gameServers = pgTable('game_servers', {
  id: text('id').primaryKey(),
  wsBaseUrl: text('ws_base_url').notNull(),
  region: text('region').notNull(),
  maxRooms: smallint('max_rooms').notNull(),
  rooms: smallint('rooms').notNull().default(0),
  players: smallint('players').notNull().default(0),
  lastHeartbeatAt: tstz('last_heartbeat_at').notNull(),
  /** Mapas que o servidor tem (rotação do painel é conferida contra eles, OG-251). */
  maps: text('maps').array().notNull().default(sql`'{}'::text[]`),
  /** Rotações padrão do servidor (ROTATION/RANKED_ROTATION, OG-378): o painel parte delas sem rotação salva. */
  rotations: jsonb('rotations').$type<Partial<Record<RotationKey, string[]>>>().notNull().default({}),
});

/** Lado que virou o clã na partida (OG-409). */
export interface MatchTeam {
  tag: string;
  name: string;
  color: string | null;
}

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    seasonId: integer('season_id').references(() => seasons.id, { onDelete: 'set null' }),
    serverId: text('server_id').notNull(),
    serverMatchId: text('server_match_id').notNull(),
    mode: gameMode('mode').notNull(),
    ranked: boolean('ranked').notNull(),
    map: text('map').notNull(),
    redScore: smallint('red_score').notNull(),
    blueScore: smallint('blue_score').notNull(),
    startedAt: tstz('started_at').notNull(),
    endedAt: tstz('ended_at').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    /** Replay gravado pelo game server (OG-090). */
    replayUrl: text('replay_url'),
    /** Formato e jogo da série (OG-250); nulos nas partidas antigas e Casual. */
    format: rankedFormat('format'),
    seriesId: uuid('series_id').references(() => rankedSeries.id, { onDelete: 'set null' }),
    gameNo: smallint('game_no'),
    /** Clã x clã (OG-259, RN-RKL-14) e os clãs de cada lado; a marcação fica se um clã for apagado. */
    clanWar: boolean('clan_war').notNull().default(false),
    redClanId: uuid('red_clan_id').references((): AnyPgColumn => clans.id, { onDelete: 'set null' }),
    blueClanId: uuid('blue_clan_id').references((): AnyPgColumn => clans.id, { onDelete: 'set null' }),
    /** Desconexões permanentes no Ranked (OG-263, RN-RKL-20): bots substitutos, vagas vazias e quando. */
    substituteBots: smallint('substitute_bots').notNull().default(0),
    shortHanded: smallint('short_handed').notNull().default(0),
    /** O clã que cada lado foi (OG-409): [vermelho, azul]; nulo = vermelho x azul. */
    teamIdentity: jsonb('team_identity').$type<[MatchTeam | null, MatchTeam | null]>(),
    substitutions: jsonb('substitutions').$type<{ kind: 'bot' | 'short'; team: 0 | 1; atSeconds: number }[]>().notNull().default([]),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('matches_server_match_idx').on(t.serverId, t.serverMatchId)],
);

export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    slot: smallint('slot').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    team: smallint('team').notNull(),
    isBot: boolean('is_bot').notNull().default(false),
    frags: integer('frags').notNull().default(0),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    captures: integer('captures').notNull().default(0),
    playSeconds: integer('play_seconds').notNull().default(0),
    scoreDelta: doublePrecision('score_delta').notNull().default(0),
    negDelta: integer('neg_delta').notNull().default(0),
    /** Clã cadastrado ao fim da partida (OG-259/273); bot substituto leva o do jogador substituído. */
    clanId: uuid('clan_id').references((): AnyPgColumn => clans.id, { onDelete: 'set null' }),
    stats: jsonb('stats').$type<Record<string, number>>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.slot] })],
);

export const ratings = pgTable(
  'ratings',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull().default(0),
    neg: integer('neg').notNull().default(0),
    matches: integer('matches').notNull().default(0),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.seasonId] })],
);

/** Rating por formato (OG-258, D-42); `ratings` é o geral, que soma os formatos e o acumulado sem formato. */
export const formatRatings = pgTable(
  'format_ratings',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    format: rankedFormat('format').notNull(),
    score: doublePrecision('score').notNull().default(0),
    neg: integer('neg').notNull().default(0),
    matches: integer('matches').notNull().default(0),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.seasonId, t.format] }), index('format_ratings_board_idx').on(t.seasonId, t.format)],
);

/**
 * Hall da fama (OG-268): os 3 primeiros de cada temporada encerrada. Até outubro/2026, no geral, por
 * formato e dos clãs (score/neg); desde novembro, de cada stat principal (`stat:<id>`, OG-354) e dos clãs.
 */
export const CHAMPION_BOARDS = ['overall', '3x3', '4x4', '5x5', 'clans'] as const;
export type ChampionBoard = (typeof CHAMPION_BOARDS)[number] | `stat:${string}`;
export const seasonChampions = pgTable(
  'season_champions',
  {
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    board: text('board').$type<ChampionBoard>().notNull(),
    position: smallint('position').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    clanId: uuid('clan_id').references((): AnyPgColumn => clans.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    clanName: text('clan_name'),
    value: doublePrecision('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.board, t.position] })],
);

export const ratingDeltas = pgTable(
  'rating_deltas',
  {
    serverId: text('server_id').notNull(),
    deltaId: text('delta_id').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    seasonId: integer('season_id').references(() => seasons.id, { onDelete: 'cascade' }),
    roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    scoreDelta: integer('score_delta').notNull(),
    negDelta: integer('neg_delta').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.deltaId] })],
);

/** Resumos da API social (OG-211, src/social-stats.ts): pares de contas, totais por dia e pontos de rating. */
export const playerPairs = pgTable(
  'player_pairs',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    otherId: uuid('other_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    together: integer('together').notNull().default(0),
    wonTogether: integer('won_together').notNull().default(0),
    lostTogether: integer('lost_together').notNull().default(0),
    against: integer('against').notNull().default(0),
    wonAgainst: integer('won_against').notNull().default(0),
    lostAgainst: integer('lost_against').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.otherId] })],
);

export const playerDaily = pgTable(
  'player_daily',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    matches: integer('matches').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    captures: integer('captures').notNull().default(0),
    playSeconds: integer('play_seconds').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** Marcos conquistados (OG-213, catálogo em src/milestones.ts). */
export const playerMilestones = pgTable(
  'player_milestones',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    milestone: text('milestone').notNull(),
    achievedAt: tstz('achieved_at').notNull(),
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.milestone] }), index('player_milestones_match_idx').on(t.matchId)],
);

/** Clãs cadastrados (OG-270, RN-CLA-01, D-47); nome e tag únicos pela forma dobrada (`clanKey`). */
export const clans = pgTable(
  'clans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    tag: text('tag').notNull(),
    tagKey: text('tag_key').notNull(),
    /** Como a tag aparece junto do nome (OG-338): `CLAN_TAG_STYLES`. */
    tagStyle: text('tag_style').$type<ClanTagStyle>().notNull().default('paren'),
    description: text('description').notNull().default(''),
    /** Cores do clã na partida (OG-407, RN-CLA-09): `#RRGGBB` da paleta `CLAN_COLORS`; nulas = sem cores. */
    primaryColor: text('primary_color'),
    secondaryColor: text('secondary_color'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('clans_name_key_idx').on(t.nameKey), uniqueIndex('clans_tag_key_idx').on(t.tagKey)],
);

export type ClanRole = 'leader' | 'admin' | 'member';

/** Um clã por jogador (RN-CLA-02); um líder por clã. Gatilhos copiam a tag para users.clan_tag. */
export const clanMembers = pgTable(
  'clan_members',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    clanId: uuid('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    role: text('role').$type<ClanRole>().notNull(),
    joinedAt: tstz('joined_at').notNull().defaultNow(),
  },
  (t) => [index('clan_members_clan_idx').on(t.clanId, t.joinedAt)],
);

/** Convites e pedidos de entrada em clã (OG-271, RN-CLA-04); um por clã e jogador. */
export const clanRequests = pgTable(
  'clan_requests',
  {
    clanId: uuid('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'invite' | 'request'>().notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.clanId, t.userId] }), index('clan_requests_user_idx').on(t.userId)],
);

export const ratingPoints = pgTable(
  'rating_points',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    seasonId: integer('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
    at: tstz('at').notNull(),
    scoreDelta: doublePrecision('score_delta').notNull(),
    negDelta: integer('neg_delta').notNull(),
  },
  (t) => [index('rating_points_user_idx').on(t.userId, t.seasonId, t.at)],
);

/** Rating de habilidade OpenSkill da conta (OG-349, D-65): um só, permanente, todos os formatos. */
export const playerSkill = pgTable('player_skill', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  mu: doublePrecision('mu').notNull(),
  sigma: doublePrecision('sigma').notNull(),
  matches: integer('matches').notNull().default(0),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

/** Variação do rating de habilidade em cada ranqueada (OG-349): antes, depois e a chance prevista do time. */
export const skillChanges = pgTable(
  'skill_changes',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    team: smallint('team').notNull(),
    muBefore: doublePrecision('mu_before').notNull(),
    sigmaBefore: doublePrecision('sigma_before').notNull(),
    muAfter: doublePrecision('mu_after').notNull(),
    sigmaAfter: doublePrecision('sigma_after').notNull(),
    winChance: doublePrecision('win_chance').notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] }), index('skill_changes_user_idx').on(t.userId)],
);

/**
 * Eventos de uma ranqueada (OG-362), em ordem; o 1º campo é o momento em décimos de segundo e os
 * jogadores são índices em `match_event_players` (−1 = ninguém). Abate: `[t, 'kill', matador,
 * vítima, salaX, salaY, vítima com bandeira (0/1), causa]`; bandeira: `[t, 'take' | 'drop' |
 * 'return' | 'capture', jogador, bandeira (0 vermelha, 1 azul, 2 selvagem)]`.
 */
export type MatchEvent = [number, 'kill', number, number, number, number, 0 | 1, string] | [number, 'take' | 'drop' | 'return' | 'capture', number, number];
export const matchEvents = pgTable('match_events', {
  matchId: uuid('match_id')
    .primaryKey()
    .references(() => matches.id, { onDelete: 'cascade' }),
  events: jsonb('events').$type<MatchEvent[]>().notNull().default([]),
});

/** Quem aparece nos eventos (OG-362); o slot pode ter mais de um jogador na partida. */
export const matchEventPlayers = pgTable(
  'match_event_players',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    idx: smallint('idx').notNull(),
    slot: smallint('slot').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    team: smallint('team').notNull(),
    isBot: boolean('is_bot').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.idx] }), index('match_event_players_user_idx').on(t.userId)],
);

/** Notificações da conta (OG-361): convite de clã, pedido de entrada no clã; marcos novos de uma partida (OG-394). */
export type NotificationKind = 'clan_invite' | 'clan_request' | 'milestone' | 'number_expiring' | 'number_released';
/** Clã (tag e nome) e quem convidou ou pediu; nos marcos, os ids e o texto dos secretos (o cliente não tem o catálogo deles). */
export interface NotificationData {
  clanTag?: string;
  clanName?: string;
  from?: string;
  milestones?: string[];
  secretNames?: Record<string, { 'pt-BR': string; en: string }>;
  /** Número a expirar ou liberado (OG-410). */
  number?: number;
}
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NotificationKind>().notNull(),
    data: jsonb('data').$type<NotificationData>().notNull().default({}),
    createdAt: tstz('created_at').notNull().defaultNow(),
    readAt: tstz('read_at'),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const bans = pgTable('bans', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  ip: inet('ip'),
  /** SHA-256 (32 hex) do id do navegador (OG-104). */
  deviceHash: text('device_hash'),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: tstz('created_at').notNull().defaultNow(),
  expiresAt: tstz('expires_at'),
  revokedAt: tstz('revoked_at'),
});

export const adminActions = pgTable('admin_actions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorName: text('actor_name').notNull(),
  targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  targetName: text('target_name'),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  reason: text('reason').notNull().default(''),
  durationSeconds: integer('duration_seconds'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

export const passwordResets = pgTable(
  'password_resets',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
    usedAt: tstz('used_at'),
  },
  (t) => [index('password_resets_user_idx').on(t.userId)],
);

export const reservedNames = pgTable(
  'reserved_names',
  {
    nameKey: text('name_key').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reservedUntil: tstz('reserved_until').notNull(),
  },
  (t) => [index('reserved_names_user_idx').on(t.userId)],
);

/** Jogador na lista da sala que o game server manda no heartbeat. */
export interface RosterEntry {
  uid: number;
  name: string;
  team: number;
  accountId?: string;
  /** Bot substituto: conta de quem ele substitui (OG-332). */
  replacedAccountId?: string;
  bot: boolean;
  muted: number;
}

export const adminCommandKind = pgEnum('admin_command_kind', ['kick', 'ban', 'mute', 'unmute', 'message']);

/** Comandos do painel para um game server, entregues na resposta do heartbeat (OG-087). */
export const adminCommands = pgTable('admin_commands', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  serverId: text('server_id').notNull(),
  roomId: text('room_id').notNull(),
  kind: adminCommandKind('kind').notNull(),
  args: jsonb('args').$type<{ uid?: number; minutes?: number; reason?: string; text?: string }>().notNull().default({}),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorName: text('actor_name').notNull(),
  platform: boolean('platform').notNull().default(false),
  createdAt: tstz('created_at').notNull().defaultNow(),
  deliveredAt: tstz('delivered_at'),
  doneAt: tstz('done_at'),
  result: jsonb('result').$type<Record<string, unknown>>(),
});

export const casualPresets = pgTable('casual_presets', {
  id: text('id').primaryKey(),
  description: text('description').notNull(),
  overrides: text('overrides').notNull().default(''),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
  deletedAt: tstz('deleted_at'),
});

export const casualPresetVersions = pgTable(
  'casual_preset_versions',
  {
    presetId: text('preset_id')
      .notNull()
      .references(() => casualPresets.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    description: text('description').notNull(),
    overrides: text('overrides').notNull(),
    deleted: boolean('deleted').notNull().default(false),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: tstz('changed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.presetId, t.version] })],
);

/** Mapas .txt enviados pela moderação (OG-366, D-70); texto em Latin-1, como os arquivos do jogo. */
export const panelMaps = pgTable('panel_maps', {
  name: text('name').primaryKey(),
  text: text('text').notNull(),
  title: text('title').notNull(),
  author: text('author').notNull().default(''),
  width: smallint('width').notNull(),
  height: smallint('height').notNull(),
  crc: integer('crc').notNull(),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
  deletedAt: tstz('deleted_at'),
});

export const panelMapVersions = pgTable(
  'panel_map_versions',
  {
    name: text('name')
      .notNull()
      .references(() => panelMaps.name, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    text: text('text').notNull(),
    crc: integer('crc').notNull(),
    deleted: boolean('deleted').notNull().default(false),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: tstz('changed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.name, t.version] })],
);

export const mapRotations = pgTable('map_rotations', {
  /** casual | ranked | ranked:3x3 | ranked:4x4 | ranked:5x5 (OG-251, `RotationKey`). */
  key: text('key').$type<RotationKey>().primaryKey(),
  maps: text('maps').array().notNull(),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

/** Aba Bots da moderação (OG-403): prefixos e nomes possíveis dos bots (uma linha, id = 1). */
export const botSettings = pgTable('bot_settings', {
  id: smallint('id').primaryKey().default(1),
  prefixes: jsonb('prefixes').$type<BotNameEntry[]>().notNull().default([]),
  names: jsonb('names').$type<BotNameEntry[]>().notNull().default([]),
  /** Chat dos bots (OG-404); `{}` = o padrão do jogo. */
  chat: jsonb('chat').$type<Record<string, unknown>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const reportStatus = pgEnum('report_status', ['open', 'dismissed', 'actioned']);

/** Denúncias do `/report` (OG-104), atendidas no painel admin (OG-087). */
export const playerReports = pgTable('player_reports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  serverId: text('server_id').notNull(),
  map: text('map'),
  reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
  reporterName: text('reporter_name').notNull(),
  targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  targetName: text('target_name').notNull(),
  targetIp: inet('target_ip'),
  targetDeviceHash: text('target_device_hash'),
  /** Denúncia de clã (OG-275), feita na página do clã. */
  clanId: uuid('clan_id').references(() => clans.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  status: reportStatus('status').notNull().default('open'),
  handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
  handledAt: tstz('handled_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

/** Convites do beta fechado (OG-106). */
export const betaInvites = pgTable('beta_invites', {
  code: text('code').primaryKey(),
  note: text('note').notNull().default(''),
  maxUses: integer('max_uses').notNull().default(1),
  uses: integer('uses').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: tstz('created_at').notNull().defaultNow(),
  expiresAt: tstz('expires_at'),
  revokedAt: tstz('revoked_at'),
});

export const betaInviteUses = pgTable(
  'beta_invite_uses',
  {
    code: text('code')
      .notNull()
      .references(() => betaInvites.code, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    usedAt: tstz('used_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.code, t.userId] })],
);

export const feedbackKind = pgEnum('feedback_kind', ['bug', 'suggestion', 'praise', 'other']);
export const feedbackStatus = pgEnum('feedback_status', ['new', 'confirmed', 'critical', 'resolved', 'dismissed']);

/** Campos do relato de bug (OG-429), os mesmos do modelo de issue do GitHub. */
export interface BugReport {
  area: string;
  summary: string;
  steps: string;
  expected: string;
  actual: string;
  frequency: 'always' | 'sometimes' | 'once';
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: string;
  workaround: string;
}

/** Feedback dos testadores (OG-106). */
export const feedback = pgTable('feedback', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  username: text('username').notNull(),
  kind: feedbackKind('kind').notNull(),
  fidelity: smallint('fidelity'),
  overall: smallint('overall'),
  veteran: boolean('veteran').notNull().default(false),
  text: text('text').notNull().default(''),
  context: jsonb('context').$type<Record<string, string | number>>().notNull().default({}),
  /** Relato de bug com os campos do modelo de issue (OG-429); null nos outros tipos. */
  bug: jsonb('bug').$type<BugReport>(),
  status: feedbackStatus('status').notNull().default('new'),
  note: text('note').notNull().default(''),
  handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
  handledAt: tstz('handled_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

/** Resumos anônimos da rede dos clientes (OG-108). */
export const netReports = pgTable('net_reports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  createdAt: tstz('created_at').notNull().defaultNow(),
  roomId: text('room_id'),
  region: text('region'),
  version: text('version').notNull(),
  browser: text('browser').notNull(),
  durationS: integer('duration_s').notNull(),
  pingP50: integer('ping_p50'),
  pingP95: integer('ping_p95'),
  lagP50: integer('lag_p50').notNull(),
  lagP95: integer('lag_p95').notNull(),
  fpsP5: integer('fps_p5').notNull(),
  fpsP50: integer('fps_p50').notNull(),
  correctionsPerMin: real('corrections_per_min').notNull(),
  stallSeconds: integer('stall_seconds').notNull(),
  framesPerSecond: real('frames_per_second').notNull(),
});

export const allTables = {
  users,
  sessions,
  player_profiles: playerProfiles,
  seasons,
  season_standings: seasonStandings,
  rooms,
  game_servers: gameServers,
  matches,
  match_players: matchPlayers,
  ratings,
  format_ratings: formatRatings,
  season_champions: seasonChampions,
  rating_deltas: ratingDeltas,
  player_pairs: playerPairs,
  player_daily: playerDaily,
  player_milestones: playerMilestones,
  clans,
  clan_members: clanMembers,
  clan_requests: clanRequests,
  rating_points: ratingPoints,
  player_skill: playerSkill,
  skill_changes: skillChanges,
  notifications,
  match_events: matchEvents,
  match_event_players: matchEventPlayers,
  bans,
  admin_actions: adminActions,
  player_reports: playerReports,
  admin_commands: adminCommands,
  casual_presets: casualPresets,
  panel_maps: panelMaps,
  panel_map_versions: panelMapVersions,
  casual_preset_versions: casualPresetVersions,
  map_rotations: mapRotations,
  bot_settings: botSettings,
  ranked_series: rankedSeries,
  beta_invites: betaInvites,
  beta_invite_uses: betaInviteUses,
  feedback,
  net_reports: netReports,
  password_resets: passwordResets,
  reserved_names: reservedNames,
};
