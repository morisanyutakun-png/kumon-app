CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"submission_id" uuid,
	"type" varchar(32) DEFAULT 'returned' NOT NULL,
	"title" varchar(255) DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "draft_score" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "draft_max_score" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "draft_result" varchar(8);--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "draft_comment" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "draft_next_range" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "draft_grader_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "draft_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_student_idx" ON "notifications" USING btree ("student_id","read_at");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_draft_grader_id_users_id_fk" FOREIGN KEY ("draft_grader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;