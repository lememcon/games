CREATE TABLE "game_player_override" (
	"bgg_id" integer PRIMARY KEY NOT NULL,
	"min_players" integer NOT NULL,
	"max_players" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "game_player_override_range_check" CHECK ("game_player_override"."min_players" >= 1 and "game_player_override"."min_players" <= "game_player_override"."max_players" and "game_player_override"."max_players" <= 99)
);
--> statement-breakpoint
ALTER TABLE "game_player_override" ADD CONSTRAINT "game_player_override_bgg_id_game_bgg_id_fk" FOREIGN KEY ("bgg_id") REFERENCES "public"."game"("bgg_id") ON DELETE no action ON UPDATE no action;