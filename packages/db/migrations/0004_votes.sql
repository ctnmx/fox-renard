CREATE TABLE "votes" (
	"comment_id" uuid NOT NULL,
	"visitor_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_comment_id_visitor_id_pk" PRIMARY KEY("comment_id","visitor_id")
);
--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ADD COLUMN "action" text DEFAULT 'reaction' NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;