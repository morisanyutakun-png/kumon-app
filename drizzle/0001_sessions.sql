DROP INDEX "submissions_assignment_unique";--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "session_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "range_text" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "submissions_assignment_idx" ON "submissions" USING btree ("assignment_id");