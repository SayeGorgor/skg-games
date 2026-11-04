ALTER TABLE "game_attempts" ADD COLUMN "client_event_id" uuid;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD COLUMN "result_key" text;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD COLUMN "challenge_date" date;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_event_uq" ON "game_attempts" USING btree ("client_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_user_result_uq" ON "game_attempts" USING btree ("user_id","result_key");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_anon_result_uq" ON "game_attempts" USING btree ("anonymous_id","result_key");--> statement-breakpoint
CREATE INDEX "attempt_user_history_idx" ON "game_attempts" USING btree ("user_id","completed_at","id");