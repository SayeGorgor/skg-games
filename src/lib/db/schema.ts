import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const gameStatus = pgEnum("game_status", ["draft", "active", "retired"]);
export const attemptStatus = pgEnum("attempt_status", [
  "started",
  "completed",
  "abandoned",
]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
]);

export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  status: gameStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dailyChallenges = pgTable(
  "daily_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    challengeDate: date("challenge_date").notNull(),
    challengeNumber: integer("challenge_number").notNull(),
    publicPayload: jsonb("public_payload").notNull().default({}),
    solutionPayload: jsonb("solution_payload").notNull().default({}),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_challenge_game_date_uq").on(t.gameId, t.challengeDate),
    uniqueIndex("daily_challenge_game_number_uq").on(
      t.gameId,
      t.challengeNumber,
    ),
    index("daily_challenge_date_idx").on(t.challengeDate),
  ],
);

export const alibiCases = pgTable("alibi_cases", {
  challengeId: uuid("challenge_id")
    .primaryKey()
    .references(() => dailyChallenges.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dek: text("dek").notNull(),
  briefTitle: text("brief_title").notNull(),
  brief: text("brief").notNull(),
  objective: text("objective").notNull(),
});

export const alibiClues = pgTable(
  "alibi_clues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: "cascade" }),
    clueNumber: integer("clue_number").notNull(),
    clue: text("clue").notNull(),
  },
  (t) => [uniqueIndex("alibi_clue_number_uq").on(t.challengeId, t.clueNumber)],
);

export const alibiSuspects = pgTable(
  "alibi_suspects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: "cascade" }),
    suspectKey: text("suspect_key").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    statement: text("statement").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    explanation: text("explanation").notNull(),
  },
  (t) => [uniqueIndex("alibi_suspect_key_uq").on(t.challengeId, t.suspectKey)],
);

export const stackPuzzlesLegacy = pgTable("stack_puzzles_legacy", {
  challengeId: uuid("challenge_id")
    .primaryKey()
    .references(() => dailyChallenges.id, { onDelete: "cascade" }),
  boardSize: integer("board_size").notNull().default(8),
  fixedCells: jsonb("fixed_cells").notNull(),
  pieces: jsonb("pieces").notNull(),
  targetCells: jsonb("target_cells").notNull(),
  canonicalSolution: jsonb("canonical_solution").notNull(),
  optimalMoves: integer("optimal_moves"),
});

export const stackDifficulty = pgEnum("stack_difficulty", [
  "small",
  "medium",
  "hard",
]);
export const attemptMode = pgEnum("attempt_mode", ["daily", "practice"]);
export const stackPuzzles = pgTable(
  "stack_puzzles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: "cascade" }),
    difficulty: stackDifficulty("difficulty").notNull(),
    generatorVersion: integer("generator_version").notNull(),
    seed: text("seed").notNull(),
    fingerprint: text("fingerprint").notNull(),
    rows: integer("rows").notNull(),
    cols: integer("cols").notNull(),
    pieces: jsonb("pieces").notNull(),
    canonicalSolution: jsonb("canonical_solution").notNull(),
    generationMetrics: jsonb("generation_metrics").notNull(),
    optimalPlacements: integer("optimal_placements").notNull(),
  },
  (t) => [
    uniqueIndex("stack_challenge_difficulty_uq").on(
      t.challengeId,
      t.difficulty,
    ),
    uniqueIndex("stack_fingerprint_uq").on(t.fingerprint),
  ],
);
export const gameAttempts = pgTable(
  "game_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    challengeId: uuid("challenge_id").references(() => dailyChallenges.id, {
      onDelete: "set null",
    }),
    gameSlug: text("game_slug").notNull(),
    challengeNumber: integer("challenge_number"),
    mode: attemptMode("mode").notNull().default("daily"),
    variant: text("variant"),
    puzzleSeed: text("puzzle_seed"),
    // Neon Auth IDs are intentionally stored without an FK into neon_auth.*.
    userId: text("user_id"),
    anonymousId: uuid("anonymous_id"),
    status: attemptStatus("status").notNull().default("completed"),
    solved: boolean("solved").notNull().default(false),
    moves: integer("moves"),
    durationMs: integer("duration_ms"),
    result: jsonb("result").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("attempt_user_idx").on(t.userId),
    index("attempt_anon_idx").on(t.anonymousId),
    index("attempt_game_idx").on(t.gameSlug, t.challengeNumber),
  ],
);

export const userGameStats = pgTable(
  "user_game_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    currentStreak: integer("current_streak").notNull().default(0),
    maxStreak: integer("max_streak").notNull().default(0),
    totalPlayed: integer("total_played").notNull().default(0),
    totalSolved: integer("total_solved").notNull().default(0),
    lastPlayedDate: date("last_played_date"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("user_game_stats_uq").on(t.userId, t.gameId)],
);

export const userProfiles = pgTable("user_profiles", {
  // Same value as the Neon Auth user id; no FK into the managed neon_auth schema.
  userId: text("user_id").primaryKey(),
  displayName: text("display_name"),
  preferredTheme: text("preferred_theme").notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const anonymousClaims = pgTable(
  "anonymous_claims",
  {
    anonymousId: uuid("anonymous_id").primaryKey(),
    userId: text("user_id").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("anonymous_claim_user_idx").on(t.userId)],
);

export const adPlacements = pgTable("ad_placements", {
  id: uuid("id").defaultRandom().primaryKey(),
  placementKey: text("placement_key").notNull().unique(),
  gameSlug: text("game_slug"),
  format: text("format").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  minViewportWidth: integer("min_viewport_width"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  status: subscriptionStatus("status").notNull().default("incomplete"),
  priceId: text("price_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const publishRuns = pgTable("publish_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  publishedCount: integer("published_count").notNull().default(0),
  notes: text("notes"),
});
