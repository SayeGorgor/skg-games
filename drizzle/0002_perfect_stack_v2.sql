CREATE TYPE "public"."attempt_mode" AS ENUM('daily', 'practice');--> statement-breakpoint
CREATE TYPE "public"."stack_difficulty" AS ENUM('small', 'medium', 'hard');--> statement-breakpoint
CREATE TABLE "stack_puzzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"difficulty" "stack_difficulty" NOT NULL,
	"generator_version" integer NOT NULL,
	"seed" text NOT NULL,
	"fingerprint" text NOT NULL,
	"rows" integer NOT NULL,
	"cols" integer NOT NULL,
	"pieces" jsonb NOT NULL,
	"canonical_solution" jsonb NOT NULL,
	"generation_metrics" jsonb NOT NULL,
	"optimal_placements" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_attempts" ALTER COLUMN "challenge_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD COLUMN "mode" "attempt_mode" DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD COLUMN "puzzle_seed" text;--> statement-breakpoint
ALTER TABLE "stack_puzzles" ADD CONSTRAINT "stack_puzzles_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stack_challenge_difficulty_uq" ON "stack_puzzles" USING btree ("challenge_id","difficulty");--> statement-breakpoint
CREATE UNIQUE INDEX "stack_fingerprint_uq" ON "stack_puzzles" USING btree ("fingerprint");