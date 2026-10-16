// Caps a played-by list at `limit` names. A lone extra name is shown rather
// than replaced by "+1 more", so nothing is hidden unless at least two are.
export const capPlayedBy = <T>(
  list: readonly T[],
  limit = 6,
): { shown: T[]; hidden: number } => {
  if (list.length <= limit + 1) return { shown: [...list], hidden: 0 };
  return { shown: list.slice(0, limit), hidden: list.length - limit };
};
