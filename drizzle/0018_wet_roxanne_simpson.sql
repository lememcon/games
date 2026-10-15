-- Sign-in is now gated on Discord server membership, so there is no approval step.
-- Pending accounts never had access; drop them rather than promote them.
DELETE FROM "app_user" WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "status" SET DEFAULT 'approved';
