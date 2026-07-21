ALTER TABLE "tournaments" ADD COLUMN "intro" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "tz_offset_min" integer DEFAULT 0 NOT NULL;