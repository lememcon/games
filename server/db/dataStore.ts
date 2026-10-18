import type { DataStore } from "../types";
import { importData } from "./import";
import {
  getGames,
  getScores,
  getTopGames,
  getYearTotals,
  listUnplayedGames,
  listYears,
} from "./read";
import type { StoreDb } from "./userStore";

export const createDataStore = (
  db: StoreDb,
  resolveCoverBaseUrl?: () => Promise<string | undefined>,
): DataStore => ({
  listYears: () => listYears(db),
  getScores: (year, resolveNames) => getScores(db, year, resolveNames),
  getGames: async () => getGames(db, await resolveCoverBaseUrl?.()),
  getTopGames: (year, discordId) => getTopGames(db, year, discordId),
  getYearTotals: () => getYearTotals(db),
  listUnplayedGames: () => listUnplayedGames(db),
  importData: (input, context) => importData(db, input, context),
});
