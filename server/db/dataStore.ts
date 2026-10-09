import type { DataStore } from "../types";
import { importData } from "./import";
import { getGames, getScores, listYears } from "./read";
import type { StoreDb } from "./userStore";

export const createDataStore = (db: StoreDb): DataStore => ({
  listYears: () => listYears(db),
  getScores: (year, resolveNames) => getScores(db, year, resolveNames),
  getGames: () => getGames(db),
  importData: (input, context) => importData(db, input, context),
});
