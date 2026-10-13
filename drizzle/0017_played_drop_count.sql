-- Contract step for played-as-a-flag (0016): drops the legacy count column and
-- its CHECK. Ship only after every release that reads or writes count is gone.
ALTER TABLE "played_count" DROP CONSTRAINT "played_count_count_check";--> statement-breakpoint
ALTER TABLE "played_count" DROP COLUMN "count";