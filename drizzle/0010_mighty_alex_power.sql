DROP INDEX "subscriptions_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_session_id_unique" ON "subscriptions" USING btree ("stripe_session_id");