CREATE TABLE "room_rosters" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"section" varchar(20) DEFAULT 'spectators' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "member_limit" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "rotate_players" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "room_rosters" ADD CONSTRAINT "room_rosters_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rosters" ADD CONSTRAINT "room_rosters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_rosters_pair_unique" ON "room_rosters" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "room_rosters_room_id_idx" ON "room_rosters" USING btree ("room_id");