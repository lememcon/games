import { inArray, sql } from "drizzle-orm";

import type { NormalizedImport } from "../import";
import { chunk, newPlayers, planGames, summarize, toMetadata } from "../shape";
import type { ImportContext, ImportSummary, MutationResult } from "../types";
import { upsertMetadata } from "./bggRepo";
import { appUser, game, player, score, year } from "./schema";
import type { StoreDb } from "./userStore";

const CHUNK = 500;
const UNIQUE_VIOLATION = "23505";

/** The SQLSTATE of a driver error, which Drizzle may wrap in `cause`. */
export function pgCode(error: unknown): string | undefined {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Serializes every transaction that writes display or player names, so the
 * cross-table name checks cannot interleave with a concurrent writer.
 */
export const lockDisplayNames = (tx: Pick<StoreDb, "execute">) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext('display_name_ns'))`);

/** A new data-file player has the same name as a member's display name. */
class NameClash extends Error {}

/**
 * Writes an upload in one transaction. A year upload inserts the year first, so
 * a duplicate is a unique violation (409) with no select-then-insert race.
 * A refusal rolls everything back.
 */
export async function importData(
  db: StoreDb,
  input: NormalizedImport,
  context: ImportContext,
): Promise<MutationResult<ImportSummary>> {
  try {
    return await db.transaction(async (tx) => {
      await lockDisplayNames(tx);
      if (input.year !== null)
        await tx.insert(year).values({
          year: input.year,
          importedBy: context.importedBy,
          sourceFilename: context.sourceFilename,
        });

      const ids = input.games.map((g) => g.bggId);
      const existingGames = ids.length
        ? await tx
            .select({ bggId: game.bggId, name: game.name })
            .from(game)
            .where(inArray(game.bggId, ids))
        : [];
      const plan = planGames(existingGames, input.games);

      const lowers = input.players.map((p) => p.toLowerCase());
      const lowerName = sql<string>`lower(${player.name})`;
      // Lowercase in SQL on both sides so matching agrees with the indexes.
      const lowered = (names: string[]) =>
        sql.join(
          names.map((n) => sql`lower(${n})`),
          sql`, `,
        );
      const inLowered = (names: string[]) =>
        sql`${lowerName} in (${lowered(names)})`;
      const existingPlayers = lowers.length
        ? await tx
            .select({ name: player.name })
            .from(player)
            .where(inLowered(input.players))
        : [];
      const fresh = newPlayers(
        existingPlayers.map((p) => p.name),
        input.players,
      );
      // A new player named like a member's display name could impersonate them.
      const clash = fresh.length
        ? await tx
            .select({ id: appUser.discordId })
            .from(appUser)
            .where(sql`lower(${appUser.displayName}) in (${lowered(fresh)})`)
            .limit(1)
        : [];
      if (clash.length) throw new NameClash();

      // Players are only ever inserted, never updated: an upload must never
      // touch player.discord_id, or it would silently unlink members. Do not
      // turn this into an upsert whose `set` clause covers that column.
      for (const names of chunk(fresh, CHUNK))
        await tx
          .insert(player)
          .values(names.map((name) => ({ name })))
          .onConflictDoNothing();
      const playerRows = lowers.length
        ? await tx
            .select({ id: player.id, name: player.name })
            .from(player)
            .where(inLowered(input.players))
        : [];
      const playerIds = new Map(
        playerRows.map((p) => [p.name.toLowerCase(), p.id]),
      );

      // Never overwrite a stored name; fill nulls. Metadata goes to
      // game_metadata, which keeps stored values when the upload has none.
      for (const games of chunk(input.games, CHUNK))
        await tx
          .insert(game)
          .values(games.map((g) => ({ bggId: g.bggId, name: g.name })))
          .onConflictDoUpdate({
            target: game.bggId,
            set: { name: sql`coalesce(${game.name}, excluded.name)` },
          });
      for (const metadata of chunk(toMetadata(input.games), CHUNK))
        await upsertMetadata(tx, metadata, new Date());

      for (const rows of chunk(input.scores, CHUNK))
        await tx.insert(score).values(
          rows.map((r) => ({
            year: input.year!,
            bggId: r.bggId,
            playerId: playerIds.get(r.player.toLowerCase())!,
            score: r.score,
            rank: r.rank,
          })),
        );

      return {
        ok: true as const,
        value: summarize(input, plan, fresh.length),
      };
    });
  } catch (error) {
    if (error instanceof NameClash)
      return { ok: false, status: 409, error: "name_taken" };
    if (input.year !== null && pgCode(error) === UNIQUE_VIOLATION)
      return { ok: false, status: 409, error: "year_exists" };
    throw error;
  }
}
