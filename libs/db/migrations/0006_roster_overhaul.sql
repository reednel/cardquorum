ALTER TABLE "room_rosters" ADD COLUMN "ready_to_play" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "rotation_mode" varchar(20) NOT NULL DEFAULT 'rotate-players';--> statement-breakpoint
UPDATE "rooms" SET "rotation_mode" = CASE WHEN "rotate_players" = true THEN 'rotate-players' ELSE 'none' END;--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "rotate_players";
