ALTER TABLE "commenters" ADD COLUMN "hyvor_author_key" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "hyvor_comment_id" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "commenters_site_id_hyvor_author_key_index" ON "commenters" USING btree ("site_id","hyvor_author_key") WHERE "commenters"."hyvor_author_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "comments_page_id_hyvor_comment_id_index" ON "comments" USING btree ("page_id","hyvor_comment_id") WHERE "comments"."hyvor_comment_id" is not null;