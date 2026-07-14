ALTER TABLE "subscriptions" ADD COLUMN "plan" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_of" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "credit_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "upgrade_of" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "upgraded_at" timestamp with time zone;