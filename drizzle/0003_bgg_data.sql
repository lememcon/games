CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "game_metadata" (
	"bgg_id" integer PRIMARY KEY NOT NULL,
	"min_players" integer,
	"max_players" integer,
	"image_url" text,
	"ext" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
