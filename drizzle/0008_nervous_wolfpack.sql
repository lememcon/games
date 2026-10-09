CREATE TABLE "played_count" (
	"discord_id" text NOT NULL,
	"year" integer NOT NULL,
	"bgg_id" integer NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "played_count_discord_id_year_bgg_id_pk" PRIMARY KEY("discord_id","year","bgg_id"),
	CONSTRAINT "played_count_count_check" CHECK ("played_count"."count" between 1 and 999)
);
--> statement-breakpoint
ALTER TABLE "played_count" ADD CONSTRAINT "played_count_discord_id_app_user_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."app_user"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "played_count" ADD CONSTRAINT "played_count_year_year_year_fk" FOREIGN KEY ("year") REFERENCES "public"."year"("year") ON DELETE cascade ON UPDATE no action;