import type { BggGame } from "./bgg/client";
import type { NormalizedImport } from "./import";
import { effectiveUser, validateChange, validateRemove } from "./roles";
import type {
  BggRepo,
  DataStore,
  GameMetadataRow,
  GamesMap,
  ImportContext,
  LegacyScoreRow,
  LinkStore,
  LinkableUser,
  PlayerLink,
  SettingRow,
  StoredUser,
  UserRow,
  UserStore,
} from "./types";

export type FakeUser = Partial<StoredUser> & UserRow;

/** In-memory UserStore for tests; applies the same rules as the SQL store. */
export function fakeStore(initial: Record<string, FakeUser> = {}) {
  const users = new Map<string, FakeUser>(Object.entries(initial));
  const repaired: string[] = [];
  /** Better Auth user id -> Discord ids, for the session resolver. */
  const logins: Record<string, string[]> = {};
  const stored = (discordId: string, u: FakeUser): StoredUser => ({
    discordId,
    name: null,
    image: null,
    username: null,
    createdAt: new Date(0),
    ...u,
  });
  const actorOf = (id: string) => effectiveUser(id, users.get(id) ?? null);

  const store: UserStore = {
    discordIds: async (userId) => (userId in logins ? logins[userId] : []),
    getOrCreate: async (discordId) => {
      if (!users.has(discordId))
        users.set(discordId, { role: "member", status: "pending" });
      return users.get(discordId)!;
    },
    repairProtected: async (discordId) => {
      repaired.push(discordId);
    },
    list: async () => [...users].map(([id, u]) => stored(id, u)),
    update: async (actorId, targetId, body) => {
      const checked = validateChange(
        actorOf(actorId),
        targetId,
        users.get(targetId) ?? null,
        body,
      );
      if (!checked.ok) return checked;
      const updated = { ...users.get(targetId)!, ...checked.value };
      users.set(targetId, updated);
      return { ok: true, value: stored(targetId, updated) };
    },
    remove: async (actorId, targetId) => {
      const checked = validateRemove(
        actorOf(actorId),
        targetId,
        users.get(targetId) ?? null,
      );
      if (checked.ok) users.delete(targetId);
      return checked;
    },
  };
  return { store, users, repaired, logins };
}

/** In-memory BggRepo for tests; mirrors the upsert rules of the SQL repo. */
export function fakeBggRepo() {
  const settings = new Map<string, SettingRow & { updatedBy: string }>();
  const rows = new Map<number, GameMetadataRow>();
  const writes: BggGame[][] = [];
  const repo: BggRepo = {
    getSetting: async (key) => settings.get(key) ?? null,
    setSetting: async (key, value, updatedBy) => {
      settings.set(key, { value, updatedBy, updatedAt: new Date(0) });
    },
    deleteSetting: async (key) => {
      settings.delete(key);
    },
    listMetadata: async () => [...rows.values()],
    upsertMetadata: async (games, fetchedAt) => {
      writes.push(games);
      for (const g of games) {
        const old = rows.get(g.bggId);
        const custom = old?.imageUrl === "custom";
        rows.set(g.bggId, {
          bggId: g.bggId,
          minPlayers: g.minPlayers ?? old?.minPlayers ?? null,
          maxPlayers: g.maxPlayers ?? old?.maxPlayers ?? null,
          imageUrl: custom ? "custom" : (g.imageUrl ?? old?.imageUrl ?? null),
          ext: custom
            ? old.ext
            : g.imageUrl != null
              ? (g.ext ?? null)
              : (old?.ext ?? null),
          fetchedAt,
        });
      }
    },
  };
  return { repo, settings, rows, writes };
}

/** In-memory DataStore for tests; the import applies the same rules as the SQL store. */
export function fakeData(
  initial: { years?: Record<number, LegacyScoreRow[]>; games?: GamesMap } = {},
) {
  const years = new Map<number, LegacyScoreRow[]>(
    Object.entries(initial.years ?? {}).map(([y, rows]) => [Number(y), rows]),
  );
  const games: GamesMap = { ...initial.games };
  const imports: { input: NormalizedImport; context: ImportContext }[] = [];

  const data: DataStore = {
    listYears: async () => [...years.keys()].sort((a, b) => b - a),
    getScores: async (year) => years.get(year) ?? null,
    getGames: async () => games,
    importData: async (input, context) => {
      if (input.year !== null && years.has(input.year))
        return { ok: false, status: 409, error: "year_exists" };
      imports.push({ input, context });
      if (input.year !== null)
        years.set(
          input.year,
          input.scores.map((s) => ({
            bgg_id: s.bggId,
            game: input.games.find((g) => g.bggId === s.bggId)?.name ?? "",
            player: s.player,
            score: s.score,
            rank: s.rank,
          })),
        );
      return {
        ok: true,
        value: {
          year: input.year,
          scores: input.scores.length,
          games: { new: input.games.length, updated: 0 },
          players: { new: input.players.length, total: input.players.length },
          warnings: input.warnings,
        },
      };
    },
  };
  return { data, years, games, imports };
}

/** In-memory LinkStore for tests; refuses unknown players and members like the SQL store. */
export function fakeLinks(
  initial: { players?: PlayerLink[]; users?: LinkableUser[] } = {},
) {
  const players = new Map<number, PlayerLink>(
    (initial.players ?? []).map((p) => [p.id, p]),
  );
  const users = initial.users ?? [];
  const calls: { playerId: number; discordId: string | null }[] = [];
  const links: LinkStore = {
    list: async () => ({ players: [...players.values()], users }),
    setLink: async (playerId, discordId) => {
      calls.push({ playerId, discordId });
      const found = players.get(playerId);
      if (!found) return { ok: false, status: 404, error: "unknown_player" };
      if (discordId !== null && !users.some((u) => u.discordId === discordId))
        return { ok: false, status: 404, error: "unknown_user" };
      players.set(playerId, { ...found, discordId });
      return { ok: true, value: null };
    },
  };
  return { links, players, calls };
}
