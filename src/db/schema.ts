import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Phase 1 + Phase 2 (Training) schema.
 * Later phases get tables only when that phase starts.
 */

export const worldStatusEnum = pgEnum("world_status", [
  "planned",
  "open",
  "closed",
]);

/** Four classic roles. Locked at creation. */
export const playerPositionEnum = pgEnum("player_position", [
  "goalkeeper",
  "defender",
  "midfielder",
  "striker",
]);

export const passingStyleEnum = pgEnum("passing_style", [
  "conservative",
  "balanced",
  "risky",
]);

export const foulIntensityEnum = pgEnum("foul_intensity", [
  "careful",
  "normal",
  "aggressive",
]);

export const skillCodeEnum = pgEnum("skill_code", [
  "FITNESS",
  "RUNNING",
  "PASSING",
  "STRENGTH",
  "DRIBBLING",
  "TACKLING",
  "INTERCEPTION",
  "FINISHING",
  "HEADING",
  "MARKING",
  "CLEARANCE",
  "SLIDING",
  "CROSSING",
  "VISION",
  "LONG_SHOTS",
  "FIRST_TOUCH",
  "SHOT_POWER",
  "OFF_BALL",
  "GK_SHORT_SAVE",
  "GK_LONG_SAVE",
  "GK_HEADER_SAVE",
  "GK_ONE_ON_ONE",
  "GK_REFLEXES",
  "GK_COMMAND",
]);

export const trainingChainColorEnum = pgEnum("training_chain_color", [
  "red",
  "yellow",
  "blue",
  "green",
]);

export const trainingSessionStatusEnum = pgEnum("training_session_status", [
  "active",
  "completed",
  "cancelled",
]);

/** What the offer trains — focus skill vs all-round conditioning. */
export const trainingOfferKindEnum = pgEnum("training_offer_kind", [
  "drill",
  "session",
  "intensive",
  "all_round",
]);

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

export const worlds = pgTable(
  "worlds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    status: worldStatusEnum("status").notNull().default("planned"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("worlds_name_uidx").on(table.name)],
);

// ---------------------------------------------------------------------------
// Auth / admin
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("users_clerk_user_id_uidx").on(table.clerkUserId)],
);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("admin_users_user_id_uidx").on(table.userId)],
);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Players — Fame / PS / skills / endurance / coins / stars (not XP)
// ---------------------------------------------------------------------------

export type PlayerAppearance = {
  gender: "male" | "female";
  /** Clean player kit — 4 = blank-face + layered kit */
  schemaVersion?: 2 | 3 | 4;
  skinToneId?: string;
  hairStyleId?: string;
  hairColorId?: string;
  browStyleId?: string;
  eyeStyleId?: string;
  eyeColorId?: string;
  noseStyleId?: string;
  mouthStyleId?: string;
  facialHairId?: string | null;
  accessoryIds?: string[];
  shirtPatternId?: string;
  shortsColourId?: string;
  socksColourId?: string;
  bootsColourId?: string;
  kitId?: string;
  /** Legacy mirrors */
  skinColour: string;
  hairColour: string;
  hairStyle: string;
  clubName?: string | null;
  clubRole?: "owner" | "member" | null;
};

export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id),
    displayName: text("display_name").notNull(),
    /** Changeable — never treat as permanent. */
    position: playerPositionEnum("position").notNull(),
    fame: integer("fame").notNull().default(0),
    /** Server-computed cache. Never trust client. */
    playingStrength: integer("playing_strength").notNull().default(0),
    coins: integer("coins").notNull().default(0),
    stars: integer("stars").notNull().default(0),
    enduranceCurrent: integer("endurance_current").notNull().default(100),
    /** Last endurance regen tick (+1 per minute while below 100). */
    enduranceResetAt: timestamp("endurance_reset_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Match/training fatigue. 0 = fresh, 100 = exhausted.
     * Recovers −1 every 2 minutes; spa programs cut it faster.
     */
    tirednessCurrent: integer("tiredness_current").notNull().default(0),
    tirednessResetAt: timestamp("tiredness_reset_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    appearance: jsonb("appearance").$type<PlayerAppearance>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("players_user_id_uidx").on(table.userId),
    index("players_world_id_idx").on(table.worldId),
  ],
);

/** Defaults for later match phase; no gameplay UI yet. */
export const playerTactics = pgTable(
  "player_tactics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    passingStyle: passingStyleEnum("passing_style")
      .notNull()
      .default("balanced"),
    foulIntensity: foulIntensityEnum("foul_intensity")
      .notNull()
      .default("normal"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("player_tactics_player_id_uidx").on(table.playerId)],
);

export const playerSkillValues = pgTable(
  "player_skill_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    skillCode: skillCodeEnum("skill_code").notNull(),
    value: integer("value").notNull().default(10),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("player_skill_values_player_skill_uidx").on(
      table.playerId,
      table.skillCode,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2 — Training
// ---------------------------------------------------------------------------

/** Three generated choices while idle. Cleared when a session starts. */
export const trainingOffers = pgTable(
  "training_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    kind: trainingOfferKindEnum("kind").notNull().default("session"),
    /** Null when kind is all_round. */
    skillCode: skillCodeEnum("skill_code"),
    durationSeconds: integer("duration_seconds").notNull(),
    enduranceCost: integer("endurance_cost").notNull(),
    coinReward: integer("coin_reward").notNull(),
    /** Points to the focus skill, or to every skill when all_round. */
    skillGain: integer("skill_gain").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("training_offers_player_id_idx").on(table.playerId)],
);

/** In-progress / finished training. Timer is server-authoritative. */
export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    kind: trainingOfferKindEnum("kind").notNull().default("session"),
    /** Null when kind is all_round. */
    skillCode: skillCodeEnum("skill_code"),
    durationSeconds: integer("duration_seconds").notNull(),
    enduranceCost: integer("endurance_cost").notNull(),
    coinReward: integer("coin_reward").notNull(),
    skillGain: integer("skill_gain").notNull(),
    chainBonus: integer("chain_bonus").notNull().default(0),
    status: trainingSessionStatusEnum("status").notNull().default("active"),
    chainColor: trainingChainColorEnum("chain_color"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("training_sessions_player_id_idx").on(table.playerId),
    index("training_sessions_status_idx").on(table.status),
  ],
);

/** Combo / chain progress for the player. */
export const playerTrainingChain = pgTable(
  "player_training_chain",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    color: trainingChainColorEnum("color"),
    nextIndex: integer("next_index").notNull().default(0),
    consecutive: integer("consecutive").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("player_training_chain_player_id_uidx").on(table.playerId),
  ],
);

// ---------------------------------------------------------------------------
// Clubs / leagues / bots
// ---------------------------------------------------------------------------

export const leagueTierEnum = pgEnum("league_tier", [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "champion",
]);

export const clubMemberRoleEnum = pgEnum("club_member_role", [
  "owner",
  "member",
]);

/** Pitch slots for a 4-4-2 squad. */
export const squadSlotEnum = pgEnum("squad_slot", [
  "gk",
  "lb",
  "cb",
  "rb",
  "lm",
  "cm",
  "rm",
  "st",
]);

export const clubs = pgTable(
  "clubs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id),
    name: text("name").notNull(),
    tier: leagueTierEnum("tier").notNull().default("bronze"),
    /** Seeded NPC clubs — real players cannot join these. */
    isSystem: integer("is_system").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("clubs_world_id_idx").on(table.worldId),
    index("clubs_tier_idx").on(table.tier),
    uniqueIndex("clubs_world_name_uidx").on(table.worldId, table.name),
  ],
);

export const clubMemberships = pgTable(
  "club_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    role: clubMemberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("club_memberships_player_id_uidx").on(table.playerId),
    index("club_memberships_club_id_idx").on(table.clubId),
  ],
);

/** NPC squad members (15 per club for 4-4-2 + bench). */
export const botPlayers = pgTable(
  "bot_players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    position: playerPositionEnum("position").notNull(),
    slot: squadSlotEnum("slot").notNull(),
    isStarter: integer("is_starter").notNull().default(1),
    playingStrength: integer("playing_strength").notNull().default(100),
    tirednessCurrent: integer("tiredness_current").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("bot_players_club_id_idx").on(table.clubId)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const worldsRelations = relations(worlds, ({ many }) => ({
  players: many(players),
  clubs: many(clubs),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  player: one(players, {
    fields: [users.id],
    references: [players.userId],
  }),
  admin: one(adminUsers, {
    fields: [users.id],
    references: [adminUsers.userId],
  }),
  auditLogs: many(auditLogs),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  user: one(users, {
    fields: [players.userId],
    references: [users.id],
  }),
  world: one(worlds, {
    fields: [players.worldId],
    references: [worlds.id],
  }),
  tactics: one(playerTactics, {
    fields: [players.id],
    references: [playerTactics.playerId],
  }),
  skills: many(playerSkillValues),
  trainingOffers: many(trainingOffers),
  trainingSessions: many(trainingSessions),
  trainingChain: one(playerTrainingChain, {
    fields: [players.id],
    references: [playerTrainingChain.playerId],
  }),
  clubMembership: one(clubMemberships, {
    fields: [players.id],
    references: [clubMemberships.playerId],
  }),
}));

export const clubsRelations = relations(clubs, ({ one, many }) => ({
  world: one(worlds, {
    fields: [clubs.worldId],
    references: [worlds.id],
  }),
  memberships: many(clubMemberships),
  bots: many(botPlayers),
}));

export const clubMembershipsRelations = relations(
  clubMemberships,
  ({ one }) => ({
    club: one(clubs, {
      fields: [clubMemberships.clubId],
      references: [clubs.id],
    }),
    player: one(players, {
      fields: [clubMemberships.playerId],
      references: [players.id],
    }),
  }),
);

export const botPlayersRelations = relations(botPlayers, ({ one }) => ({
  club: one(clubs, {
    fields: [botPlayers.clubId],
    references: [clubs.id],
  }),
}));

export const playerTacticsRelations = relations(playerTactics, ({ one }) => ({
  player: one(players, {
    fields: [playerTactics.playerId],
    references: [players.id],
  }),
}));

export const playerSkillValuesRelations = relations(
  playerSkillValues,
  ({ one }) => ({
    player: one(players, {
      fields: [playerSkillValues.playerId],
      references: [players.id],
    }),
  }),
);

export const adminUsersRelations = relations(adminUsers, ({ one }) => ({
  user: one(users, {
    fields: [adminUsers.userId],
    references: [users.id],
  }),
}));

export const trainingOffersRelations = relations(trainingOffers, ({ one }) => ({
  player: one(players, {
    fields: [trainingOffers.playerId],
    references: [players.id],
  }),
}));

export const trainingSessionsRelations = relations(
  trainingSessions,
  ({ one }) => ({
    player: one(players, {
      fields: [trainingSessions.playerId],
      references: [players.id],
    }),
  }),
);

export const playerTrainingChainRelations = relations(
  playerTrainingChain,
  ({ one }) => ({
    player: one(players, {
      fields: [playerTrainingChain.playerId],
      references: [players.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type Player = typeof players.$inferSelect;
export type PlayerTactics = typeof playerTactics.$inferSelect;
export type PlayerSkillValue = typeof playerSkillValues.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type World = typeof worlds.$inferSelect;
export type TrainingOffer = typeof trainingOffers.$inferSelect;
export type TrainingSession = typeof trainingSessions.$inferSelect;
export type PlayerTrainingChain = typeof playerTrainingChain.$inferSelect;
export type Club = typeof clubs.$inferSelect;
export type ClubMembership = typeof clubMemberships.$inferSelect;
export type BotPlayer = typeof botPlayers.$inferSelect;
export type PlayerPosition = (typeof playerPositionEnum.enumValues)[number];
export type SkillCode = (typeof skillCodeEnum.enumValues)[number];
export type LeagueTier = (typeof leagueTierEnum.enumValues)[number];
export type SquadSlot = (typeof squadSlotEnum.enumValues)[number];
export type TrainingChainColor =
  (typeof trainingChainColorEnum.enumValues)[number];
export type TrainingOfferKind =
  (typeof trainingOfferKindEnum.enumValues)[number];
