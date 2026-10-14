CREATE TABLE "spent_bot_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
CREATE INDEX "spent_bot_challenges_expires_at_index" ON "spent_bot_challenges" USING btree ("expires_at");