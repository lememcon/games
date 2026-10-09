ALTER TABLE "player" ADD COLUMN "discord_id" text;--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_discord_id_app_user_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."app_user"("discord_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_discord_id_idx" ON "player" USING btree ("discord_id");