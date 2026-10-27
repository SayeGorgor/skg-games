CREATE TYPE "public"."attempt_status" AS ENUM('started', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TABLE "ad_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placement_key" text NOT NULL,
	"game_slug" text,
	"format" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"min_viewport_width" integer,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_placements_placement_key_unique" UNIQUE("placement_key")
);
--> statement-breakpoint
CREATE TABLE "alibi_cases" (
	"challenge_id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"dek" text NOT NULL,
	"brief_title" text NOT NULL,
	"brief" text NOT NULL,
	"objective" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alibi_clues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"clue_number" integer NOT NULL,
	"clue" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alibi_suspects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"suspect_key" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"statement" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anonymous_claims" (
	"anonymous_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"challenge_date" date NOT NULL,
	"challenge_number" integer NOT NULL,
	"public_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"solution_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid,
	"game_slug" text NOT NULL,
	"challenge_number" integer NOT NULL,
	"user_id" text,
	"anonymous_id" uuid,
	"status" "attempt_status" DEFAULT 'completed' NOT NULL,
	"solved" boolean DEFAULT false NOT NULL,
	"moves" integer,
	"duration_ms" integer,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" "game_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "publish_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_count" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "stack_puzzles" (
	"challenge_id" uuid PRIMARY KEY NOT NULL,
	"board_size" integer DEFAULT 8 NOT NULL,
	"fixed_cells" jsonb NOT NULL,
	"pieces" jsonb NOT NULL,
	"target_cells" jsonb NOT NULL,
	"canonical_solution" jsonb NOT NULL,
	"optimal_moves" integer
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" "subscription_status" DEFAULT 'incomplete' NOT NULL,
	"price_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "user_game_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"max_streak" integer DEFAULT 0 NOT NULL,
	"total_played" integer DEFAULT 0 NOT NULL,
	"total_solved" integer DEFAULT 0 NOT NULL,
	"last_played_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"preferred_theme" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alibi_cases" ADD CONSTRAINT "alibi_cases_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alibi_clues" ADD CONSTRAINT "alibi_clues_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alibi_suspects" ADD CONSTRAINT "alibi_suspects_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_challenges" ADD CONSTRAINT "daily_challenges_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD CONSTRAINT "game_attempts_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stack_puzzles" ADD CONSTRAINT "stack_puzzles_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_game_stats" ADD CONSTRAINT "user_game_stats_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alibi_clue_number_uq" ON "alibi_clues" USING btree ("challenge_id","clue_number");--> statement-breakpoint
CREATE UNIQUE INDEX "alibi_suspect_key_uq" ON "alibi_suspects" USING btree ("challenge_id","suspect_key");--> statement-breakpoint
CREATE INDEX "anonymous_claim_user_idx" ON "anonymous_claims" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_challenge_game_date_uq" ON "daily_challenges" USING btree ("game_id","challenge_date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_challenge_game_number_uq" ON "daily_challenges" USING btree ("game_id","challenge_number");--> statement-breakpoint
CREATE INDEX "daily_challenge_date_idx" ON "daily_challenges" USING btree ("challenge_date");--> statement-breakpoint
CREATE INDEX "attempt_user_idx" ON "game_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attempt_anon_idx" ON "game_attempts" USING btree ("anonymous_id");--> statement-breakpoint
CREATE INDEX "attempt_game_idx" ON "game_attempts" USING btree ("game_slug","challenge_number");--> statement-breakpoint
CREATE UNIQUE INDEX "user_game_stats_uq" ON "user_game_stats" USING btree ("user_id","game_id");