ALTER TABLE "alibi_cases" ADD COLUMN "case_id" text;--> statement-breakpoint
ALTER TABLE "alibi_cases" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "alibi_cases" ADD CONSTRAINT "alibi_cases_case_id_unique" UNIQUE("case_id");--> statement-breakpoint
ALTER TABLE "alibi_cases" ADD CONSTRAINT "alibi_cases_fingerprint_unique" UNIQUE("fingerprint");