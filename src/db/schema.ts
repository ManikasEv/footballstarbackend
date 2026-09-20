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
 * Phase 1 schema only.
 * Later phases (training, clubs, matches, …) get tables when that phase starts —
 * not as empty stubs.
 */

export const worldStatusEnum = pgEnum("world_status", [
  "planned",
  "open",
  "closed",
]);

/** Four classic roles. Position is changeable — not permanent. */
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
  "PASSING",
  "FITNESS",
  "DRIBBLING",
  "TACKLING",
  "INTERCEPTION",
  "FINISHING",
  "RUNNING",
  "GK_SHORT_SAVE",
  "GK_HEADER_SAVE",
  "GK_LONG_SAVE",
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
  skinColour: string;
  hairColour: string;
  hairStyle: string;
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
    /** Next UTC midnight for mature endurance reset (no passive regen). */
    enduranceResetAt: timestamp("endurance_reset_at", { withTimezone: true })
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
// Relations
// ---------------------------------------------------------------------------

export const worldsRelations = relations(worlds, ({ many }) => ({
  players: many(players),
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

export type User = typeof users.$inferSelect;
export type Player = typeof players.$inferSelect;
export type PlayerTactics = typeof playerTactics.$inferSelect;
export type PlayerSkillValue = typeof playerSkillValues.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type World = typeof worlds.$inferSelect;
export type PlayerPosition = (typeof playerPositionEnum.enumValues)[number];
export type SkillCode = (typeof skillCodeEnum.enumValues)[number];
