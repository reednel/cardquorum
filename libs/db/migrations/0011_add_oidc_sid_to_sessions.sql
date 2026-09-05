ALTER TABLE "sessions" ADD COLUMN "oidc_sid" text;--> statement-breakpoint
CREATE INDEX "idx_sessions_oidc_sid" ON "sessions" USING btree ("oidc_sid");