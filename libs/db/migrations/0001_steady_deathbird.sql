CREATE TABLE "room_bans" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_bans" ADD CONSTRAINT "room_bans_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_bans" ADD CONSTRAINT "room_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_bans_pair_unique" ON "room_bans" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "room_bans_user_id_idx" ON "room_bans" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_invites_pair_unique" ON "room_invites" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "room_invites_user_id_idx" ON "room_invites" USING btree ("user_id");