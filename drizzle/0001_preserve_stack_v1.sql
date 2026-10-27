ALTER TABLE "stack_puzzles" RENAME TO "stack_puzzles_legacy";--> statement-breakpoint
ALTER TABLE "stack_puzzles_legacy" RENAME CONSTRAINT "stack_puzzles_pkey" TO "stack_puzzles_legacy_pkey";--> statement-breakpoint
ALTER TABLE "stack_puzzles_legacy" DROP CONSTRAINT "stack_puzzles_challenge_id_daily_challenges_id_fk";
--> statement-breakpoint
ALTER TABLE "stack_puzzles_legacy" ADD CONSTRAINT "stack_puzzles_legacy_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;
