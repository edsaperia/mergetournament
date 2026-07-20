CREATE TYPE "public"."merge_side" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."slot_out_state" AS ENUM('pending', 'filled', 'empty');--> statement-breakpoint
ALTER TABLE "merges" ADD COLUMN "working_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "merges" ADD COLUMN "proposed_by" "merge_side";--> statement-breakpoint
ALTER TABLE "merges" ADD COLUMN "bearer_pref_a" "merge_side";--> statement-breakpoint
ALTER TABLE "merges" ADD COLUMN "bearer_pref_b" "merge_side";--> statement-breakpoint
ALTER TABLE "merges" ADD COLUMN "active_a" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merges" ADD COLUMN "active_b" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "out_state" "slot_out_state" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "out_text_id" uuid;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "out_bearer_id" uuid;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_out_text_id_text_versions_id_fk" FOREIGN KEY ("out_text_id") REFERENCES "public"."text_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_out_bearer_id_participants_id_fk" FOREIGN KEY ("out_bearer_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;