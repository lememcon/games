import type { DataStore } from "../types";
import { importData } from "./import";
import { getGames, getScores, listYears } from "./read";
import type { StoreDb } from "./userStore";

export const createDataStore = (db: StoreDb): DataStore => ({
  listYears: () => listYears(db),
  getScores: (year) => getScores(db, year),
  getGames: () => getGames(db),
  importData: (input, context) => importData(db, input, context),
});
