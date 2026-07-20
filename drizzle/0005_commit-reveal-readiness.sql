ALTER TABLE "merges" ADD COLUMN "ready_a" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merges" ADD COLUMN "ready_b" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "master_secret" text;