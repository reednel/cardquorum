ALTER TABLE "game_sessions" DROP CONSTRAINT "game_sessions_room_id_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "game_sessions" ALTER COLUMN "room_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;