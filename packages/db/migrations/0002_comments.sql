CREATE TABLE "commenters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"commenter_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "commenter_id" uuid;--> statement-breakpoint
ALTER TABLE "commenters" ADD CONSTRAINT "commenters_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_commenter_id_commenters_id_fk" FOREIGN KEY ("commenter_id") REFERENCES "public"."commenters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_page_id_created_at_index" ON "comments" USING btree ("page_id","created_at");--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_commenter_id_commenters_id_fk" FOREIGN KEY ("commenter_id") REFERENCES "public"."commenters"("id") ON DELETE set null ON UPDATE no action;