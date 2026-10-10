import type { BggGame } from "./bgg/client";
import type { NormalizedImport } from "./import";
import { refuse } from "./result";
import { effectiveUser, validateChange, validateRemove } from "./roles";
import type {
  BggRepo,
  DataStore,
  GameMetadataRow,
  GamePlayersRow,
  GamesMap,
  ImportContext,
  LegacyScoreRow,
  LinkStore,
  LinkableUser,
  MemberOverrideStore,
  PlayedCounts,
  PlayedStore,
  PlayerLink,
  PlayerRange,
  Profile,
  ProfileStore,
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
    displayName: null,
    createdAt: new Date(0),
    ...u,
  });
  const actorOf = (id: string) => effectiveUser(id, users.get(id) ?? null);

  const store: UserStore = {
    discordIds: async (userId) => (userId in logins ? logins[userId] : []),
    getOrCreate: async (discordId) => {
      if (!users.has(discordId))
        users.set(discordId, { role: "member", status: "pending" });
      return { displayName: null, ...users.get(discordId)! };
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
  initial: {
    years?: Record<number, LegacyScoreRow[]>;
    games?: GamesMap;
    /** Games the admin player-count routes know about. */
    gamePlayers?: GamePlayersRow[];
  } = {},
) {
  const years = new Map<number, LegacyScoreRow[]>(
    Object.entries(initial.years ?? {}).map(([y, rows]) => [Number(y), rows]),
  );
  const games: GamesMap = { ...initial.games };
  const players = new Map<number, GamePlayersRow>(
    (initial.gamePlayers ?? []).map((g) => [g.bggId, g]),
  );
  const overrideCalls: {
    bggId: number;
    range: PlayerRange;
    updatedBy: string;
  }[] = [];
  const imports: { input: NormalizedImport; context: ImportContext }[] = [];
  const scoreCalls: { year: number; resolveNames: boolean }[] = [];

  const data: DataStore = {
    listYears: async () => [...years.keys()].sort((a, b) => b - a),
    getScores: async (year, resolveNames = false) => {
      scoreCalls.push({ year, resolveNames });
      const rows = years.get(year);
      // Like the SQL store, only approved callers get `discord_id`, and
      // `discord_image` only with it.
      return rows
        ? rows.map(({ discord_id, discord_image, ...rest }) =>
            resolveNames && discord_id
              ? {
                  ...rest,
                  discord_id,
                  ...(discord_image ? { discord_image } : {}),
                }
              : rest,
          )
        : null;
    },
    getGames: async () => games,
    listGamePlayers: async () => [...players.values()],
    setPlayerOverride: async (bggId, range, updatedBy) => {
      overrideCalls.push({ bggId, range, updatedBy });
      const found = players.get(bggId);
      if (!found) return refuse(404, "unknown_game");
      const same = found.bgg?.min === range.min && found.bgg?.max === range.max;
      players.set(bggId, { ...found, override: same ? null : range });
      return { ok: true, value: null };
    },
    clearPlayerOverride: async (bggId) => {
      const found = players.get(bggId);
      if (found) players.set(bggId, { ...found, override: null });
    },
    importData: async (input, context) => {
      if (input.year !== null && years.has(input.year))
        return refuse(409, "year_exists");
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
  return { data, years, games, imports, scoreCalls, players, overrideCalls };
}

/** In-memory LinkStore for tests; refuses unknown players and members like the SQL store. */
export function fakeLinks(
  initial: {
    players?: PlayerLink[];
    users?: LinkableUser[];
    /** Display names by Discord id, enforced like the SQL store. */
    names?: Record<string, string>;
  } = {},
) {
  const players = new Map<number, PlayerLink>(
    (initial.players ?? []).map((p) => [p.id, p]),
  );
  const users = initial.users ?? [];
  const names = initial.names ?? {};
  const calls: { playerId: number; discordId: string | null }[] = [];
  const links: LinkStore = {
    list: async () => ({ players: [...players.values()], users }),
    setLink: async (playerId, discordId) => {
      calls.push({ playerId, discordId });
      const found = players.get(playerId);
      if (!found) return refuse(404, "unknown_player");
      if (discordId !== null && !users.some((u) => u.discordId === discordId))
        return refuse(404, "unknown_user");
      const checked = discordId === null ? found.discordId : discordId;
      const clash = Object.entries(names).some(
        ([id, n]) =>
          n.toLowerCase() === found.name.toLowerCase() &&
          (discordId === null ? id === checked : id !== checked),
      );
      if (clash) return refuse(409, "name_taken");
      players.set(playerId, { ...found, discordId });
      return { ok: true, value: null };
    },
  };
  return { links, players, calls };
}

/** In-memory ProfileStore for tests; enforces unique names like the SQL store. */
export function fakeProfiles(
  initial: { profiles?: Profile[]; names?: Record<string, string> } = {},
) {
  const profiles = new Map<string, Profile>(
    (initial.profiles ?? []).map((p) => [p.discordId, p]),
  );
  /** Display names in use by other members or players, by Discord id. */
  const names = new Map<string, string>(Object.entries(initial.names ?? {}));
  const calls: { discordId: string; displayName: string | null }[] = [];
  const store: ProfileStore = {
    setDisplayName: async (discordId, displayName) => {
      calls.push({ discordId, displayName });
      const taken = [...names].some(
        ([id, n]) =>
          id !== discordId && n.toLowerCase() === displayName?.toLowerCase(),
      );
      if (taken) return refuse(409, "name_taken");
      if (displayName === null) names.delete(discordId);
      else names.set(discordId, displayName);
      return { ok: true, value: { displayName } };
    },
    getProfile: async (discordId) => profiles.get(discordId) ?? null,
  };
  return { profiles: store, calls, names };
}

/** In-memory PlayedStore for tests; refuses years that were not given. */
export function fakePlayed(
  initial: { years?: number[]; counts?: Record<string, PlayedCounts> } = {},
) {
  const years = new Set(initial.years ?? [2025]);
  /** Counts by `discordId:year`. */
  const rows = new Map<string, PlayedCounts>(
    Object.entries(initial.counts ?? {}),
  );
  const calls: { discordId: string; year: number; bggId?: number }[] = [];
  const bucket = (discordId: string, year: number) => {
    const key = `${discordId}:${year}`;
    if (!rows.has(key)) rows.set(key, {});
    return rows.get(key)!;
  };
  const played: PlayedStore = {
    getAll: async (year) => {
      calls.push({ discordId: "*", year });
      if (!years.has(year)) return null;
      const all: Record<string, PlayedCounts> = {};
      for (const [key, counts] of rows) {
        const [discordId, y] = key.split(":");
        const present = Object.fromEntries(
          Object.entries(counts).filter(([, n]) => n > 0),
        );
        if (Number(y) === year && Object.keys(present).length > 0)
          all[discordId] = present;
      }
      return all;
    },
    get: async (discordId, year) => {
      calls.push({ discordId, year });
      return years.has(year) ? { ...bucket(discordId, year) } : null;
    },
    set: async (discordId, year, bggId, count) => {
      calls.push({ discordId, year, bggId });
      if (!years.has(year)) return refuse(404, "unknown_year");
      const counts = bucket(discordId, year);
      if (count === 0) delete counts[bggId];
      else counts[bggId] = count;
      return { ok: true, value: null };
    },
    importCounts: async (discordId, year, incoming) => {
      calls.push({ discordId, year });
      if (!years.has(year)) return refuse(404, "unknown_year");
      const counts = bucket(discordId, year);
      for (const [id, count] of incoming) counts[id] ??= count;
      return { ok: true, value: { ...counts } };
    },
  };
  return { played, rows, calls };
}

/**
 * In-memory MemberOverrideStore for tests. `linked` are the Discord ids with a
 * linked player, `bases` the base range by bgg id (absent: unknown game, null:
 * no range); it applies the same refusals as the SQL store.
 */
export function fakeMemberOverrides(
  initial: {
    linked?: string[];
    bases?: Record<number, PlayerRange | null>;
    overrides?: Record<string, Record<string, PlayerRange>>;
  } = {},
) {
  const linked = new Set(initial.linked ?? []);
  const bases = new Map(
    Object.entries(initial.bases ?? {}).map(([id, r]) => [Number(id), r]),
  );
  const rows: Record<string, Record<string, PlayerRange>> = {
    ...initial.overrides,
  };
  const calls: { discordId: string; bggId: number; range?: PlayerRange }[] = [];
  const memberOverrides: MemberOverrideStore = {
    getAll: async () => rows,
    set: async (discordId, bggId, range) => {
      calls.push({ discordId, bggId, range });
      if (!linked.has(discordId)) return refuse(403, "not_linked");
      const base = bases.get(bggId);
      if (base === undefined) return refuse(404, "unknown_game");
      if (base === null) return refuse(409, "no_player_range");
      if (range.min < base.min || range.max > base.max)
        return refuse(400, "out_of_range");
      (rows[discordId] ??= {})[bggId] = range;
      return { ok: true, value: null };
    },
    clear: async (discordId, bggId) => {
      calls.push({ discordId, bggId });
      if (rows[discordId]) delete rows[discordId][bggId];
    },
  };
  return { memberOverrides, rows, calls };
}
