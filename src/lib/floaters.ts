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

/**
 * Samples up to `count` unique ids (partial Fisher-Yates) and gives each a
 * lane across the width plus randomized motion values.
 */
export const pickFloaters = (
  ids: readonly string[],
  count: number,
  rng: () => number = Math.random,
): Floater[] => {
  const pool = [...ids];
  const n = Math.max(0, Math.min(count, pool.length));
  const lane = 100 / Math.max(n, 1);
  const picked: Floater[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    const duration = 40 + rng() * 40;
    picked.push({
      id: pool[i],
      left: lane * i + rng() * lane * 0.6,
      top: rng() * 80,
      size: 70 + Math.round(rng() * 60),
      duration,
      delay: -rng() * duration,
      opacity: 0.3,
    });
  }
  return picked;
};
