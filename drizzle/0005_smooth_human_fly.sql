CREATE TABLE "game" (
	"bgg_id" integer PRIMARY KEY NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "player" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"bgg_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"score" integer NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "score_year_game_player_unique" UNIQUE("year","bgg_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "year" (
	"year" integer PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"imported_by" text,
	"source_filename" text
);
--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_year_year_year_fk" FOREIGN KEY ("year") REFERENCES "public"."year"("year") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_bgg_id_game_bgg_id_fk" FOREIGN KEY ("bgg_id") REFERENCES "public"."game"("bgg_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_name_lower_idx" ON "player" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "score_year_idx" ON "score" USING btree ("year");