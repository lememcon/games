import type { DataStore } from "../types";
import { importData } from "./import";
import {
  clearPlayerOverride,
  getGames,
  getScores,
  listGamePlayers,
  listYears,
  setPlayerOverride,
} from "./read";
import type { StoreDb } from "./userStore";

export const createDataStore = (db: StoreDb): DataStore => ({
  listYears: () => listYears(db),
  getScores: (year, resolveNames) => getScores(db, year, resolveNames),
  getGames: () => getGames(db),
  listGamePlayers: () => listGamePlayers(db),
  setPlayerOverride: (bggId, range, updatedBy) =>
    setPlayerOverride(db, bggId, range, updatedBy),
  clearPlayerOverride: (bggId) => clearPlayerOverride(db, bggId),
  importData: (input, context) => importData(db, input, context),
});
