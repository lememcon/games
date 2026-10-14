-- Contract step for played-as-a-flag (0016): drops count and its CHECK. The current
-- release (played-boolean, #131 onward) still inserts played_count.count, so any older
-- API instance still running when this migrates fails played writes, and rolling the API
-- back to an earlier image afterwards breaks them. Ship only once no such release serves.
ALTER TABLE "played_count" DROP CONSTRAINT "played_count_count_check";--> statement-breakpoint
ALTER TABLE "played_count" DROP COLUMN "count";