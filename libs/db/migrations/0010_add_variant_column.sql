ALTER TABLE "game_sessions" ADD COLUMN "variant" varchar(100);--> statement-breakpoint
UPDATE "game_sessions" SET "variant" = "config" ->> 'name' WHERE "variant" IS NULL AND "config" ->> 'name' IS NOT NULL;--> statement-breakpoint
UPDATE "game_sessions" SET "config" = "config" - 'name';--> statement-breakpoint
CREATE INDEX "idx_game_sessions_report_filter" ON "game_sessions" USING btree ("game_type","status","finished_at") WHERE "game_sessions"."status" = 'finished';--> statement-breakpoint
CREATE INDEX "idx_game_sessions_variant" ON "game_sessions" USING btree ("variant") WHERE "game_sessions"."variant" IS NOT NULL;