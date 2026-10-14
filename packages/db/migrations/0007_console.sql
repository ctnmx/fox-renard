CREATE TABLE "console_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_links" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "console_sessions" ADD CONSTRAINT "console_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_in_links" ADD CONSTRAINT "sign_in_links_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "console_sessions_member_id_index" ON "console_sessions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "console_sessions_expires_at_index" ON "console_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sign_in_links_member_id_index" ON "sign_in_links" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "sign_in_links_expires_at_index" ON "sign_in_links" USING btree ("expires_at");