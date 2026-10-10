LOCK TABLE "member_veto" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DELETE FROM "member_veto" a USING "member_veto" b WHERE a."discord_id" = b."discord_id" AND a."bgg_id" = b."bgg_id" AND a."year" > b."year";
--> statement-breakpoint
ALTER TABLE "member_veto" DROP CONSTRAINT "member_veto_year_year_year_fk";
--> statement-breakpoint
ALTER TABLE "member_veto" DROP CONSTRAINT "member_veto_discord_id_year_bgg_id_pk";--> statement-breakpoint
ALTER TABLE "member_veto" DROP COLUMN "year";--> statement-breakpoint
ALTER TABLE "member_veto" ADD CONSTRAINT "member_veto_discord_id_bgg_id_pk" PRIMARY KEY("discord_id","bgg_id");
