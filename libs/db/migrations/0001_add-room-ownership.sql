CREATE TABLE "game_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"game_type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'waiting' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"store" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "owner_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "visibility" varchar(20) DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_name_unique" UNIQUE("name");