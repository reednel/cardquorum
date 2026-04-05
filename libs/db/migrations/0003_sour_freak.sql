CREATE TABLE "room_game_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"game_type" varchar(50),
	"preset_name" varchar(100),
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"autostart" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_game_settings_room_id_unique" UNIQUE("room_id")
);
--> statement-breakpoint
ALTER TABLE "room_game_settings" ADD CONSTRAINT "room_game_settings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;