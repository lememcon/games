import type { DataStore } from "../types";
import { importData } from "./import";
import { getGames, getScores, getYearTotals, listYears } from "./read";
import type { StoreDb } from "./userStore";

export const createDataStore = (db: StoreDb): DataStore => ({
  listYears: () => listYears(db),
  getScores: (year, resolveNames) => getScores(db, year, resolveNames),
  getGames: () => getGames(db),
  getYearTotals: () => getYearTotals(db),
  importData: (input, context) => importData(db, input, context),
});
