CREATE TYPE "public"."account_status" AS ENUM('active', 'pending');--> statement-breakpoint
CREATE TABLE "setup_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"subject_id" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"phone" varchar(32) DEFAULT '' NOT NULL,
	"student_name" varchar(255) DEFAULT '' NOT NULL,
	"grade" varchar(64) DEFAULT '' NOT NULL,
	"grade_code" varchar(16) DEFAULT '' NOT NULL,
	"subjects" text DEFAULT '' NOT NULL,
	"subject_labels" text DEFAULT '' NOT NULL,
	"subject_count" integer DEFAULT 0 NOT NULL,
	"monthly_amount" integer DEFAULT 0 NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"stripe_session_id" varchar(255),
	"user_id" uuid,
	"student_id" uuid,
	"status" "account_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "account_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "setup_tokens" ADD CONSTRAINT "setup_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_subjects" ADD CONSTRAINT "subscription_subjects_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "setup_tokens_hash_unique" ON "setup_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_subjects_unique" ON "subscription_subjects" USING btree ("subscription_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_email_unique" ON "subscriptions" USING btree ("email");