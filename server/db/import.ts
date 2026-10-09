import { inArray, sql } from "drizzle-orm";

import type { NormalizedImport } from "../import";
import { chunk, newPlayers, planGames, summarize } from "../shape";
import type { ImportContext, ImportSummary, MutationResult } from "../types";
import { game, player, score, year } from "./schema";
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
      const existingPlayers = lowers.length
        ? await tx
            .select({ name: player.name })
            .from(player)
            .where(inArray(lowerName, lowers))
        : [];
      const fresh = newPlayers(
        existingPlayers.map((p) => p.name),
        input.players,
      );
      for (const names of chunk(fresh, CHUNK))
        await tx
          .insert(player)
          .values(names.map((name) => ({ name })))
          .onConflictDoNothing();
      const playerRows = lowers.length
        ? await tx
            .select({ id: player.id, name: player.name })
            .from(player)
            .where(inArray(lowerName, lowers))
        : [];
      const playerIds = new Map(
        playerRows.map((p) => [p.name.toLowerCase(), p.id]),
      );

      // Never overwrite a stored name; fill nulls; keep stored metadata when
      // the upload has none.
      for (const games of chunk(input.games, CHUNK))
        await tx
          .insert(game)
          .values(games)
          .onConflictDoUpdate({
            target: game.bggId,
            set: {
              name: sql`coalesce(${game.name}, excluded.name)`,
              minPlayers: sql`coalesce(excluded.min_players, ${game.minPlayers})`,
              maxPlayers: sql`coalesce(excluded.max_players, ${game.maxPlayers})`,
              imageUrl: sql`coalesce(excluded.image_url, ${game.imageUrl})`,
              imageExt: sql`coalesce(excluded.image_ext, ${game.imageExt})`,
              updatedAt: sql`now()`,
            },
          });

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
    if (input.year !== null && pgCode(error) === UNIQUE_VIOLATION)
      return { ok: false, status: 409, error: "year_exists" };
    throw error;
  }
}
