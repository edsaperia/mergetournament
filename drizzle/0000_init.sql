CREATE TYPE "public"."merge_resolution" AS ENUM('agreed', 'bearer_flip', 'backstop_flip', 'active_advance', 'abandoned', 'walkover');--> statement-breakpoint
CREATE TYPE "public"."merge_state" AS ENUM('pending', 'open', 'locked', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('participant', 'admin');--> statement-breakpoint
CREATE TYPE "public"."room_kind" AS ENUM('global', 'draft', 'merge');--> statement-breakpoint
CREATE TYPE "public"."round_state" AS ENUM('scheduled', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."slot_kind" AS ENUM('merge', 'bye');--> statement-breakpoint
CREATE TYPE "public"."text_kind" AS ENUM('draft', 'merge_result', 'working_archived');--> statement-breakpoint
CREATE TYPE "public"."tournament_phase" AS ENUM('setup', 'submission', 'convening', 'running', 'complete');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'participants_only');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tournament_id" uuid NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"kind" "room_kind" NOT NULL,
	"subject_id" uuid
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text_version_id" uuid NOT NULL,
	"range_start" integer NOT NULL,
	"range_end" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"is_ad_hoc" boolean DEFAULT false NOT NULL,
	"text_a_id" uuid,
	"text_b_id" uuid,
	"bearer_a_id" uuid,
	"bearer_b_id" uuid,
	"ydoc_ref" text,
	"state" "merge_state" DEFAULT 'pending' NOT NULL,
	"locked_at" timestamp with time zone,
	"result_text_id" uuid,
	"advancing_bearer_id" uuid,
	"resolution" "merge_resolution",
	"flip_seed" bigint
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" "message_kind" DEFAULT 'user' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"role" "participant_role" DEFAULT 'participant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"scheduled_start_s" integer NOT NULL,
	"actual_start_s" integer,
	"actual_close_s" integer,
	"state" "round_state" DEFAULT 'scheduled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"round_no" integer NOT NULL,
	"position" integer NOT NULL,
	"kind" "slot_kind" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "text_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"kind" text_kind NOT NULL,
	"body_md" text NOT NULL,
	"word_count" integer NOT NULL,
	"parent_a_id" uuid,
	"parent_b_id" uuid,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"phase" "tournament_phase" DEFAULT 'setup' NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"round_duration_s" integer NOT NULL,
	"break_duration_s" integer NOT NULL,
	"submission_deadline" timestamp with time zone,
	"start_at" timestamp with time zone,
	"begun_at" timestamp with time zone,
	"seed" bigint,
	"paused_at" timestamp with time zone,
	"total_paused_s" integer DEFAULT 0 NOT NULL,
	"default_submission" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_participants_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_text_version_id_text_versions_id_fk" FOREIGN KEY ("text_version_id") REFERENCES "public"."text_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merges" ADD CONSTRAINT "merges_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merges" ADD CONSTRAINT "merges_text_a_id_text_versions_id_fk" FOREIGN KEY ("text_a_id") REFERENCES "public"."text_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merges" ADD CONSTRAINT "merges_text_b_id_text_versions_id_fk" FOREIGN KEY ("text_b_id") REFERENCES "public"."text_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merges" ADD CONSTRAINT "merges_bearer_a_id_participants_id_fk" FOREIGN KEY ("bearer_a_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merges" ADD CONSTRAINT "merges_bearer_b_id_participants_id_fk" FOREIGN KEY ("bearer_b_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merges" ADD CONSTRAINT "merges_result_text_id_text_versions_id_fk" FOREIGN KEY ("result_text_id") REFERENCES "public"."text_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merges" ADD CONSTRAINT "merges_advancing_bearer_id_participants_id_fk" FOREIGN KEY ("advancing_bearer_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_participants_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_versions" ADD CONSTRAINT "text_versions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_versions" ADD CONSTRAINT "text_versions_parent_a_id_text_versions_id_fk" FOREIGN KEY ("parent_a_id") REFERENCES "public"."text_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_versions" ADD CONSTRAINT "text_versions_parent_b_id_text_versions_id_fk" FOREIGN KEY ("parent_b_id") REFERENCES "public"."text_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_versions" ADD CONSTRAINT "text_versions_author_id_participants_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_tournament_created" ON "audit_log" USING btree ("tournament_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_rooms_tournament_kind_subject" ON "chat_rooms" USING btree ("tournament_id","kind","subject_id");--> statement-breakpoint
CREATE INDEX "comments_text_version" ON "comments" USING btree ("text_version_id");--> statement-breakpoint
CREATE INDEX "merges_slot" ON "merges" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "messages_room_created" ON "messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_tournament_email" ON "participants" USING btree ("tournament_id","email");--> statement-breakpoint
CREATE INDEX "participants_token_hash" ON "participants" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_tournament_number" ON "rounds" USING btree ("tournament_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_tournament_round_position" ON "slots" USING btree ("tournament_id","round_no","position");--> statement-breakpoint
CREATE INDEX "text_versions_tournament" ON "text_versions" USING btree ("tournament_id");