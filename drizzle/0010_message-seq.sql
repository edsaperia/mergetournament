-- Messages posted in one transaction share now(); seq gives them a deterministic insertion order.
-- Existing rows are numbered in their old display order (created_at, then id) before the identity takes over.
ALTER TABLE "messages" ADD COLUMN "seq" bigint;--> statement-breakpoint
UPDATE "messages" SET "seq" = o."n" FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS "n" FROM "messages") o WHERE "messages"."id" = o."id";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "seq" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (sequence name "messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
SELECT setval('"messages_seq_seq"', COALESCE((SELECT max("seq") FROM "messages"), 0) + 1, false);--> statement-breakpoint
CREATE INDEX "messages_room_seq" ON "messages" USING btree ("room_id","seq");
