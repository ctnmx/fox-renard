CREATE TABLE "magic_links" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"email" text NOT NULL,
	"visitor_id" uuid NOT NULL,
	"commenter_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commenters" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "commenters" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "display_name" text;--> statement-breakpoint
UPDATE "comments" SET "display_name" = "commenters"."display_name" FROM "commenters" WHERE "commenters"."id" = "comments"."commenter_id";--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_commenter_id_commenters_id_fk" FOREIGN KEY ("commenter_id") REFERENCES "public"."commenters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "magic_links_commenter_id_index" ON "magic_links" USING btree ("commenter_id");--> statement-breakpoint
CREATE INDEX "magic_links_expires_at_index" ON "magic_links" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commenters_site_id_email_index" ON "commenters" USING btree ("site_id","email") WHERE "commenters"."verified_at" is not null;