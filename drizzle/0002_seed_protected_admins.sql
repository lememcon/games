-- Built-in admins (Kelsin, Waymost). Existing accounts are not backfilled:
-- everyone else is created as pending on their next login.
INSERT INTO "app_user" ("discord_id", "role", "status") VALUES
	('71449887429894144', 'admin', 'approved'),
	('560653672485486592', 'admin', 'approved')
ON CONFLICT ("discord_id") DO NOTHING;
