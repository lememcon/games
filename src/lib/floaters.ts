import type { PlayerGameScore } from "@/types";

export interface Floater {
  id: string;
  /** Horizontal position, percent of the viewport width. */
  left: number;
  /** Vertical position (percent); only used for the static reduced-motion layout. */
  top: number;
  /** Cover width in px. */
  size: number;
  /** Seconds per drift cycle. */
  duration: number;
  /** Seconds; negative so the motion is already underway on first paint. */
  delay: number;
  opacity: number;
}

/** The numeric game id in a cover path ("/src/assets/games/123.jpg" -> "123"). */
export const coverId = (path: string): string | null =>
  /\/(\d+)\.[^./]+$/.exec(path)?.[1] ?? null;

/** The cover keys whose game id is allowed; null allows every cover. */
export const buildCoverPool = (
  keys: readonly string[],
  allowedIds: ReadonlySet<string> | null,
): string[] => {
  if (allowedIds === null) return [...keys];
  return keys.filter((key) => {
    const id = coverId(key);
    return id !== null && allowedIds.has(id);
  });
};

/**
 * A player's highest raw scores: unique game ids (as strings), best first,
 * ties broken by the lower game id.
 */
export const topScoreIds = (
  rows: readonly PlayerGameScore[],
  discordId: string,
  limit = 10,
): string[] => {
  const ids = new Set<string>();
  rows
    .filter((row) => row.discord_id === discordId)
    .sort((a, b) => b.score - a.score || a.bgg_id - b.bgg_id)
    .forEach((row) => ids.add(`${row.bgg_id}`));
  return [...ids].slice(0, limit);
};

const motion = (
  id: string,
  i: number,
  lane: number,
  rng: () => number,
): Floater => {
  const duration = 40 + rng() * 40;
  return {
    id,
    left: lane * i + rng() * lane * 0.6,
    top: rng() * 80,
    size: 70 + Math.round(rng() * 60),
    duration,
    delay: -rng() * duration,
    opacity: 0.3,
  };
};

/**
 * Samples up to `count` unique ids (partial Fisher-Yates) and gives each a
 * lane across the width plus randomized motion values. `preferred` ids that
 * are in the pool come first (up to `count`); random ids fill the rest, and
 * the whole set is shuffled so the favourites are not all in the left lanes.
 */
export const pickFloaters = (
  ids: readonly string[],
  count: number,
  rng: () => number = Math.random,
  preferred: readonly string[] = [],
): Floater[] => {
  const n = Math.max(0, Math.min(count, ids.length));
  const lane = 100 / Math.max(n, 1);
  const inPool = new Set(ids);
  const first = [...new Set(preferred)]
    .filter((id) => inPool.has(id))
    .slice(0, n);
  const chosen = new Set(first);
  const pool = ids.filter((id) => !chosen.has(id));
  const picked: Floater[] = [];

  if (first.length === 0) {
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      picked.push(motion(pool[i], i, lane, rng));
    }
    return picked;
  }

  const order = [...first];
  for (let i = 0; order.length < n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    order.push(pool[i]);
  }
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((id, i) => motion(id, i, lane, rng));
};
