CREATE TABLE "member_veto" (
	"discord_id" text NOT NULL,
	"year" integer NOT NULL,
	"bgg_id" integer NOT NULL,
	CONSTRAINT "member_veto_discord_id_year_bgg_id_pk" PRIMARY KEY("discord_id","year","bgg_id")
);
--> statement-breakpoint
ALTER TABLE "member_veto" ADD CONSTRAINT "member_veto_discord_id_app_user_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."app_user"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_veto" ADD CONSTRAINT "member_veto_year_year_year_fk" FOREIGN KEY ("year") REFERENCES "public"."year"("year") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_veto" ADD CONSTRAINT "member_veto_bgg_id_game_bgg_id_fk" FOREIGN KEY ("bgg_id") REFERENCES "public"."game"("bgg_id") ON DELETE cascade ON UPDATE no action;