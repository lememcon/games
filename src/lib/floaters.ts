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

/** The ids in `ids` that are allowed; null allows every id. */
export const buildCoverPool = (
  ids: readonly string[],
  allowedIds: ReadonlySet<string> | null,
): string[] =>
  allowedIds === null ? [...ids] : ids.filter((id) => allowedIds.has(id));

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
 * When `weights` gives every in-pool preferred id a finite, non-uniform value,
 * the preferred slots are instead weighted draws with replacement (so a
 * dominant score can appear more than once); otherwise `weights` is ignored.
 */
export const pickFloaters = (
  ids: readonly string[],
  count: number,
  rng: () => number = Math.random,
  preferred: readonly string[] = [],
  weights?: Readonly<Record<string, number>>,
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

  const w = weights ? first.map((id) => weights[id]) : [];
  const min = Math.min(...w);
  const weighted =
    w.length > 0 && w.every(Number.isFinite) && w.some((x) => x !== w[0]);
  let order = [...first];
  if (weighted) {
    const shift = min <= 0 ? 1 - min : 0;
    const cum: number[] = [];
    let total = 0;
    for (const x of w) cum.push((total += x + shift));
    order = first.map(() => {
      const r = rng() * total;
      const k = cum.findIndex((c) => r < c);
      return first[k === -1 ? first.length - 1 : k];
    });
  }
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
