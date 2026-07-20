CREATE TYPE "public"."advance_choice" AS ENUM('working', 'input');--> statement-breakpoint
ALTER TYPE "public"."round_state" ADD VALUE 'closing' BEFORE 'closed';--> statement-breakpoint
ALTER TABLE "merges" ADD COLUMN "active_choice_a" "advance_choice";--> statement-breakpoint
ALTER TABLE "merges" ADD COLUMN "active_choice_b" "advance_choice";