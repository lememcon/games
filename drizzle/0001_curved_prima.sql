CREATE TABLE "app_user" (
	"discord_id" text PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_role_check" CHECK ("app_user"."role" in ('member', 'admin')),
	CONSTRAINT "app_user_status_check" CHECK ("app_user"."status" in ('pending', 'approved'))
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_provider_account_unique" UNIQUE("provider_id","account_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_provider_unique" UNIQUE("user_id","provider_id");