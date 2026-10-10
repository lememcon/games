CREATE TABLE "member_player_override" (
	"discord_id" text NOT NULL,
	"bgg_id" integer NOT NULL,
	"min_players" integer NOT NULL,
	"max_players" integer NOT NULL,
	CONSTRAINT "member_player_override_discord_id_bgg_id_pk" PRIMARY KEY("discord_id","bgg_id"),
	CONSTRAINT "member_player_override_range_check" CHECK ("member_player_override"."min_players" >= 1 and "member_player_override"."min_players" <= "member_player_override"."max_players" and "member_player_override"."max_players" <= 99)
);
--> statement-breakpoint
ALTER TABLE "member_player_override" ADD CONSTRAINT "member_player_override_discord_id_app_user_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."app_user"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_player_override" ADD CONSTRAINT "member_player_override_bgg_id_game_bgg_id_fk" FOREIGN KEY ("bgg_id") REFERENCES "public"."game"("bgg_id") ON DELETE cascade ON UPDATE no action;