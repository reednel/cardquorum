ALTER TABLE "room_rosters" ADD COLUMN "last_visited_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "description" varchar(256);--> statement-breakpoint
UPDATE "room_rosters" SET "last_visited_at" = "created_at" WHERE "last_visited_at" IS NOT NULL;