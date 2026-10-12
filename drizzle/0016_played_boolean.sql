-- Played becomes a yes/no flag: a row means the member played the game that
-- year. Collapses recorded counts to 1. The count column and its CHECK stay so
-- the previous release keeps working while this one rolls out.
UPDATE "played_count" SET "count" = 1 WHERE "count" > 1;
