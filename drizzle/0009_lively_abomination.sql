DROP INDEX "player_discord_id_idx";--> statement-breakpoint
CREATE INDEX "player_discord_id_idx" ON "player" USING btree ("discord_id");