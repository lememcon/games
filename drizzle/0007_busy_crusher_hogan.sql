DROP INDEX "player_discord_id_idx";--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "display_name" text;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_display_name_lower_idx" ON "app_user" USING btree (lower("display_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "player_discord_id_idx" ON "player" USING btree ("discord_id") WHERE "player"."discord_id" is not null;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_display_name_check" CHECK ("app_user"."display_name" is null or char_length(btrim("app_user"."display_name")) between 1 and 32);