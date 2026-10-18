import type { BggGame } from "./bgg/client";
import {
  createCoverConfig,
  type MakeStorage,
  type S3Config,
  type S3Env,
} from "./covers/config";
import { CoverFetchError } from "./covers/fetch";
import { createCoverService } from "./covers/service";
import type { NormalizedImport } from "./import";
import { refuse } from "./result";
import { effectiveUser, validateChange, validateRemove } from "./roles";
import { topGames } from "./shape";
import type {
  AllPlayedGames,
  BggRepo,
  CoverStorage,
  DataStore,
  GameMetadataRow,
  GamesMap,
  ImportContext,
  LegacyScoreRow,
  LinkStore,
  LinkableUser,
  MemberOverrideStore,
  MemberVetoStore,
  MemberYearVetoStore,
  MyVetoRow,
  MyYearVetoRow,
  PlayedGames,
  PlayedStore,
  PlayerLink,
  PlayerRange,
  Profile,
  ProfileStore,
  SettingRow,
  StoredUser,
  UserRow,
  UserStore,
  YearTotal,
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
    color: null,
    createdAt: new Date(0),
    ...u,
  });
  const actorOf = (id: string) => effectiveUser(id, users.get(id) ?? null);

  const store: UserStore = {
    discordIds: async (userId) => (userId in logins ? logins[userId] : []),
    getOrCreate: async (discordId) => {
      if (!users.has(discordId))
        users.set(discordId, { role: "member", status: "approved" });
      return { displayName: null, color: null, ...users.get(discordId)! };
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
  const covers = new Map<number, { key: string; source: string }>();
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
    setCover: async (bggId, key, source) => {
      const row = rows.get(bggId);
      if (!row || row.imageUrl !== source) return false;
      covers.set(bggId, { key, source });
      return true;
    },
    setCustomCover: async (bggId, key) => {
      const row = rows.get(bggId);
      if (!row) return false;
      row.imageUrl = "custom";
      covers.set(bggId, { key, source: "custom" });
      return true;
    },
    listCoverNeeds: async () =>
      [...rows.values()]
        .filter((r) => {
          const c = covers.get(r.bggId);
          return (
            r.imageUrl?.startsWith("https://") &&
            c?.source !== "custom" &&
            (!c || c.source !== r.imageUrl)
          );
        })
        .map((r) => ({ bggId: r.bggId, imageUrl: r.imageUrl! }))
        .sort((a, b) => a.bggId - b.bggId),
  };
  return { repo, settings, rows, writes, covers };
}

/**
 * A real cover service over in-memory fakes, for createApp. Storage is null
 * (not configured) unless given; fetching a cover always fails.
 */
export function fakeCovers(opts: { storage?: CoverStorage | null } = {}) {
  const bgg = fakeBggRepo();
  const covers = createCoverService({
    repo: bgg.repo,
    resolveStorage: async () => ({
      storage: opts.storage ?? null,
      coverBaseUrl: "https://covers.example",
    }),
    fetchCover: async () => {
      throw new CoverFetchError("upstream");
    },
    sleep: async () => {},
    log: () => {},
  });
  return { covers, repo: bgg.repo, rows: bgg.rows, coverRows: bgg.covers };
}

/**
 * A real cover config over an in-memory repo, for createApp and config tests.
 * `makeStorage` records each config it was given and returns a fake storage.
 */
export function fakeCoverConfig(
  opts: {
    env?: S3Env;
    makeStorage?: MakeStorage;
    now?: () => number;
    secret?: string;
  } = {},
) {
  const bgg = fakeBggRepo();
  const made: S3Config[] = [];
  const storage = fakeStorage();
  const config = createCoverConfig({
    repo: bgg.repo,
    secret: opts.secret ?? "x".repeat(32),
    env: opts.env ?? {},
    makeStorage:
      opts.makeStorage ??
      ((cfg) => {
        made.push(cfg);
        return storage.storage;
      }),
    now: opts.now,
  });
  return { config, repo: bgg.repo, settings: bgg.settings, made, storage };
}

/** In-memory CoverStorage for tests; records puts, optionally failing every one. */
export function fakeStorage(opts: { fail?: boolean } = {}) {
  const puts: { key: string; bytes: Uint8Array; contentType: string }[] = [];
  const deletes: string[] = [];
  const storage: CoverStorage = {
    put: async (key, bytes, contentType) => {
      if (opts.fail) throw new Error("storage failed");
      puts.push({ key, bytes, contentType });
    },
    delete: async (key) => {
      deletes.push(key);
    },
  };
  return { storage, puts, deletes };
}

/** Code-unit string comparison, matching the SQL collation. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** In-memory DataStore for tests; the import applies the same rules as the SQL store. */
export function fakeData(
  initial: {
    years?: Record<number, LegacyScoreRow[]>;
    games?: GamesMap;
    /** Game names by bgg id, for `listUnplayedGames` (scored games are skipped). */
    names?: Record<number, string>;
  } = {},
) {
  const years = new Map<number, LegacyScoreRow[]>(
    Object.entries(initial.years ?? {}).map(([y, rows]) => [Number(y), rows]),
  );
  const games: GamesMap = { ...initial.games };
  const imports: { input: NormalizedImport; context: ImportContext }[] = [];
  const scoreCalls: { year: number; resolveNames: boolean }[] = [];
  const topCalls: { year: number; discordId: string }[] = [];

  const data: DataStore = {
    listYears: async () => [...years.keys()].sort((a, b) => b - a),
    getScores: async (year, resolveNames = false) => {
      scoreCalls.push({ year, resolveNames });
      const rows = years.get(year);
      // Like the SQL store, only approved callers get `discord_id`, and
      // `discord_image` only with it.
      return rows
        ? rows.map(({ discord_id, discord_image, color, ...rest }) =>
            resolveNames && discord_id
              ? {
                  ...rest,
                  discord_id,
                  ...(discord_image ? { discord_image } : {}),
                  ...(color ? { color } : {}),
                }
              : rest,
          )
        : null;
    },
    getGames: async () => games,
    getTopGames: async (year, discordId) => {
      topCalls.push({ year, discordId });
      const rows = years.get(year);
      if (!rows) return null;
      return topGames(
        rows
          .filter((r) => r.discord_id === discordId)
          .map((r, id) => ({
            id,
            owner: discordId,
            bggId: r.bgg_id,
            year,
            score: r.score,
            rank: r.rank,
          })),
      );
    },
    getYearTotals: async () => {
      const sums = new Map<string, YearTotal>();
      for (const [year, rows] of years)
        for (const r of rows) {
          const key = `${year}:${r.bgg_id}`;
          const found = sums.get(key) ?? { year, bgg_id: r.bgg_id, total: 0 };
          sums.set(key, { ...found, total: found.total + r.score });
        }
      return [...sums.values()].sort(
        (a, b) => a.year - b.year || a.bgg_id - b.bgg_id,
      );
    },
    listUnplayedGames: async () => {
      const scored = new Set(
        [...years.values()].flatMap((rows) => rows.map((r) => r.bgg_id)),
      );
      return Object.entries(initial.names ?? {})
        .filter(([id]) => !scored.has(Number(id)))
        .map(([id, name]) => ({ bgg_id: Number(id), name }))
        .sort(
          (a, b) =>
            cmp(a.name.toLowerCase(), b.name.toLowerCase()) ||
            cmp(a.name, b.name) ||
            a.bgg_id - b.bgg_id,
        );
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
  return { data, years, games, imports, scoreCalls, topCalls };
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
  initial: {
    profiles?: Profile[];
    names?: Record<string, string>;
    /** Discord ids that exist as members, for `setColor`. */
    members?: string[];
  } = {},
) {
  const profiles = new Map<string, Profile>(
    (initial.profiles ?? []).map((p) => [p.discordId, p]),
  );
  /** Display names in use by other members or players, by Discord id. */
  const names = new Map<string, string>(Object.entries(initial.names ?? {}));
  const calls: { discordId: string; displayName: string | null }[] = [];
  /** Picked colors by Discord id; `setColor` refuses ids not in `members`. */
  const colors = new Map<string, string>();
  const colorCalls: { discordId: string; color: string | null }[] = [];
  const members = new Set(initial.members ?? []);
  const store: ProfileStore = {
    setColor: async (discordId, color) => {
      colorCalls.push({ discordId, color });
      if (!members.has(discordId)) return refuse(404, "not_found");
      if (color === null) colors.delete(discordId);
      else colors.set(discordId, color);
      return { ok: true, value: { color } };
    },
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
  return { profiles: store, calls, names, colors, colorCalls };
}

/** In-memory PlayedStore for tests; refuses years that were not given. */
export function fakePlayed(
  initial: {
    years?: number[];
    played?: Record<string, number[]>;
    /** Approved members, for `markPlayed`; absent means every id is known. */
    members?: string[];
    /** Scored bgg ids by year; absent means every game is in every year. */
    games?: Record<number, number[]>;
  } = {},
) {
  const years = new Set(initial.years ?? [2025]);
  /** Played bgg ids by `discordId:year`. */
  const rows = new Map<string, Set<number>>(
    Object.entries(initial.played ?? {}).map(([key, ids]) => [
      key,
      new Set(ids),
    ]),
  );
  const calls: { discordId: string; year: number; bggId?: number }[] = [];
  const inYear = (year: number, bggId: number) =>
    !initial.games || (initial.games[year] ?? []).includes(bggId);
  const bucket = (discordId: string, year: number) => {
    const key = `${discordId}:${year}`;
    if (!rows.has(key)) rows.set(key, new Set());
    return rows.get(key)!;
  };
  const list = (ids: Set<number>): PlayedGames =>
    [...ids].sort((a, b) => a - b).map(String);
  const played: PlayedStore = {
    getAll: async (year) => {
      calls.push({ discordId: "*", year });
      if (!years.has(year)) return null;
      const all: AllPlayedGames = {};
      for (const [key, ids] of rows) {
        const [discordId, y] = key.split(":");
        if (Number(y) === year && ids.size > 0) all[discordId] = list(ids);
      }
      return all;
    },
    get: async (discordId, year) => {
      calls.push({ discordId, year });
      return years.has(year) ? list(bucket(discordId, year)) : null;
    },
    set: async (discordId, year, bggId, isPlayed) => {
      calls.push({ discordId, year, bggId });
      if (!years.has(year)) return refuse(404, "unknown_year");
      if (isPlayed && !inYear(year, bggId)) return refuse(404, "unknown_game");
      const ids = bucket(discordId, year);
      if (isPlayed) ids.add(bggId);
      else ids.delete(bggId);
      return { ok: true, value: null };
    },
    markPlayed: async (discordIds, year, bggId) => {
      calls.push({ discordId: [...discordIds].join(","), year, bggId });
      if (!years.has(year)) return refuse(404, "unknown_year");
      if (!inYear(year, bggId)) return refuse(404, "unknown_game");
      if (
        initial.members &&
        [...discordIds].some((id) => !initial.members!.includes(id))
      )
        return refuse(422, "unknown_member");
      for (const id of discordIds) bucket(id, year).add(bggId);
      return { ok: true, value: (await played.getAll(year))! };
    },
    importPlayed: async (discordId, year, incoming) => {
      calls.push({ discordId, year });
      if (!years.has(year)) return refuse(404, "unknown_year");
      const ids = bucket(discordId, year);
      for (const id of incoming) if (inYear(year, id)) ids.add(id);
      return { ok: true, value: list(ids) };
    },
    clear: async (discordId, year) => {
      calls.push({ discordId, year });
      if (!years.has(year)) return refuse(404, "unknown_year");
      bucket(discordId, year).clear();
      return { ok: true, value: null };
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

/**
 * In-memory MemberVetoStore for tests. `games` are the known games by bgg id
 * (name or null); it applies the same refusals as the SQL store.
 */
export function fakeMemberVetoes(
  initial: {
    games?: Record<number, string | null>;
    meta?: Record<number, { image?: string | null; ext?: string | null }>;
    vetoes?: { discordId: string; bggId: number }[];
  } = {},
) {
  const games = new Map(
    Object.entries(initial.games ?? { 1: "Root" }).map(([id, n]) => [
      Number(id),
      n,
    ]),
  );
  const rows = [...(initial.vetoes ?? [])];
  const calls: { discordId: string; bggId: number }[] = [];
  const memberVetoes: MemberVetoStore = {
    getAll: async () =>
      rows.map(({ discordId, bggId }) => ({ discordId, bggId })),
    listMine: async (discordId) =>
      rows
        .filter((r) => r.discordId === discordId)
        .map(({ bggId }): MyVetoRow => ({
          bggId,
          name: games.get(bggId) ?? null,
          image: initial.meta?.[bggId]?.image ?? null,
          ext: initial.meta?.[bggId]?.ext ?? null,
        })),
    set: async (discordId, bggId) => {
      calls.push({ discordId, bggId });
      if (!games.has(bggId)) return refuse(404, "unknown_game");
      if (!rows.some((r) => r.discordId === discordId && r.bggId === bggId))
        rows.push({ discordId, bggId });
      return { ok: true, value: null };
    },
    clear: async (discordId, bggId) => {
      calls.push({ discordId, bggId });
      const i = rows.findIndex(
        (r) => r.discordId === discordId && r.bggId === bggId,
      );
      if (i >= 0) rows.splice(i, 1);
    },
  };
  return { memberVetoes, rows, calls };
}

/**
 * In-memory MemberYearVetoStore for tests. `years` are the known years and
 * `games` the known games by bgg id (name or null); it applies the same refusals as the SQL store.
 */
export function fakeMemberYearVetoes(
  initial: {
    years?: number[];
    games?: Record<number, string | null>;
    meta?: Record<number, { image?: string | null; ext?: string | null }>;
    vetoes?: { discordId: string; year: number; bggId: number }[];
  } = {},
) {
  const years = new Set(initial.years ?? [2025, 2026]);
  const games = new Map(
    Object.entries(initial.games ?? { 1: "Root" }).map(([id, n]) => [
      Number(id),
      n,
    ]),
  );
  const rows = [...(initial.vetoes ?? [])];
  const calls: {
    discordId: string;
    year: number;
    bggId: number;
  }[] = [];
  const same = (
    r: { discordId: string; year: number; bggId: number },
    discordId: string,
    year: number,
    bggId: number,
  ) => r.discordId === discordId && r.year === year && r.bggId === bggId;
  const memberYearVetoes: MemberYearVetoStore = {
    getAll: async (year) =>
      years.has(year)
        ? rows
            .filter((r) => r.year === year)
            .map(({ discordId, bggId }) => ({ discordId, bggId }))
        : null,
    listMine: async (discordId) =>
      rows
        .filter((r) => r.discordId === discordId)
        .map(({ year, bggId }): MyYearVetoRow => ({
          year,
          bggId,
          name: games.get(bggId) ?? null,
          image: initial.meta?.[bggId]?.image ?? null,
          ext: initial.meta?.[bggId]?.ext ?? null,
        }))
        .sort(
          (a, b) =>
            b.year - a.year ||
            Number(a.name === null) - Number(b.name === null) ||
            (a.name ?? "").localeCompare(b.name ?? "") ||
            a.bggId - b.bggId,
        ),
    set: async (discordId, year, bggId) => {
      calls.push({ discordId, year, bggId });
      if (!years.has(year)) return refuse(404, "unknown_year");
      if (!games.has(bggId)) return refuse(404, "unknown_game");
      if (!rows.some((r) => same(r, discordId, year, bggId)))
        rows.push({ discordId, year, bggId });
      return { ok: true, value: null };
    },
    clear: async (discordId, year, bggId) => {
      calls.push({ discordId, year, bggId });
      const i = rows.findIndex((r) => same(r, discordId, year, bggId));
      if (i >= 0) rows.splice(i, 1);
    },
  };
  return { memberYearVetoes, rows, calls };
}
