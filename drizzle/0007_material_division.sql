CREATE TYPE "public"."division" AS ENUM('elementary', 'secondary');--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "division" "division" DEFAULT 'elementary' NOT NULL;