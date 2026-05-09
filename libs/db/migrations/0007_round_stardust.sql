CREATE TABLE "game_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer,
	"session_id" integer NOT NULL,
	"user_id" integer,
	"event_type" varchar(50) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message" varchar(500),
	"seq" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"seat_index" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_game_events_room_created" ON "game_events" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_game_events_session_seq" ON "game_events" USING btree ("session_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_game_participants_session_user" ON "game_participants" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_game_participants_user" ON "game_participants" USING btree ("user_id");