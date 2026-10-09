import type { BggGame } from "./bgg/client";
import { effectiveUser, validateChange, validateRemove } from "./roles";
import type {
  BggRepo,
  GameMetadataRow,
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
