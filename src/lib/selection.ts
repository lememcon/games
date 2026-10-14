// Pure helpers for the bulk-veto selection.

// A new set with id flipped; the input is never mutated.
export const toggleSelected = (
  selected: ReadonlySet<string>,
  id: string,
): Set<string> => {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
};

// Numeric bgg ids to veto: skips ids that are not numbers and games the
// member has already vetoed.
export const vetoTargets = (
  selected: Iterable<string>,
  alreadyVetoed: ReadonlySet<string> | undefined,
): number[] =>
  [...selected]
    .filter((id) => !alreadyVetoed?.has(id))
    .map(Number)
    .filter((n) => !Number.isNaN(n));

export const bulkFailureMessage = (failed: number, total: number): string =>
  `${failed} of ${total} didn't save`;
