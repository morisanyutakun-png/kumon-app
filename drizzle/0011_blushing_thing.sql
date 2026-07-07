CREATE TABLE "material_complete_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"blob_url" text NOT NULL,
	"pathname" text NOT NULL,
	"file_name" varchar(255) DEFAULT '' NOT NULL,
	"content_type" varchar(128) DEFAULT 'application/pdf' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "returned_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"blob_url" text NOT NULL,
	"pathname" text NOT NULL,
	"file_name" varchar(255) DEFAULT '' NOT NULL,
	"content_type" varchar(128) DEFAULT 'application/pdf' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_complete_files" ADD CONSTRAINT "material_complete_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_complete_files" ADD CONSTRAINT "material_complete_files_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returned_files" ADD CONSTRAINT "returned_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returned_files" ADD CONSTRAINT "returned_files_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returned_files" ADD CONSTRAINT "returned_files_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "material_complete_files_material_unique" ON "material_complete_files" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "returned_files_submission_idx" ON "returned_files" USING btree ("submission_id");