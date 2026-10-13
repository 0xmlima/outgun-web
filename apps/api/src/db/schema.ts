// SPDX-License-Identifier: GPL-2.0-or-later
// Tabelas para o Drizzle. A fonte de verdade é o SQL de migrations/; schema.test.ts confere que as
// duas descrições têm as mesmas colunas.
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const gameMode = pgEnum('game_mode', ['casual', 'ranked']);
export type GameMode = (typeof gameMode.enumValues)[number];

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    usernameKey: text('username_key').notNull(),
    email: text('email').notNull(),
    emailKey: text('email_key').notNull(),
    passwordHash: text('password_hash').notNull(),
    clanTag: text('clan_tag'),
    isAdmin: boolean('is_admin').notNull().default(false),
    usernameChangedAt: tstz('username_changed_at'),
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
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  startsAt: tstz('starts_at').notNull(),
  endsAt: tstz('ends_at'),
  active: boolean('active').notNull().default(false),
});

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
  createdAt: tstz('created_at').notNull().defaultNow(),
}, (t) => [index('rooms_server_idx').on(t.serverId)]);

export const gameServers = pgTable('game_servers', {
  id: text('id').primaryKey(),
  wsBaseUrl: text('ws_base_url').notNull(),
  region: text('region').notNull(),
  maxRooms: smallint('max_rooms').notNull(),
  rooms: smallint('rooms').notNull().default(0),
  players: smallint('players').notNull().default(0),
  lastHeartbeatAt: tstz('last_heartbeat_at').notNull(),
});

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

export const bans = pgTable('bans', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  ip: inet('ip'),
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

export const allTables = {
  users,
  sessions,
  player_profiles: playerProfiles,
  seasons,
  rooms,
  game_servers: gameServers,
  matches,
  match_players: matchPlayers,
  ratings,
  rating_deltas: ratingDeltas,
  bans,
  admin_actions: adminActions,
  password_resets: passwordResets,
  reserved_names: reservedNames,
};
