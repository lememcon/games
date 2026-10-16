import type { MyYearVeto } from "@/types";

export const MAX_DISPLAY_NAME = 32;

// Client-side check mirroring the server's length rule (code points, after
// trimming). A blank name is valid: it clears the display name. The server
// stays the authority on the character rules.
export const displayNameError = (input: string): string | null =>
  [...input.trim()].length > MAX_DISPLAY_NAME
    ? `Use ${MAX_DISPLAY_NAME} characters or fewer.`
    : null;

// Groups year vetoes by year, newest first; rows keep their given order within a year.
export const groupYearVetoes = (
  rows: MyYearVeto[],
): { year: number; vetoes: MyYearVeto[] }[] => {
  const groups = new Map<number, MyYearVeto[]>();
  for (const row of rows)
    groups.set(row.year, [...(groups.get(row.year) ?? []), row]);
  return [...groups]
    .map(([year, vetoes]) => ({ year, vetoes }))
    .sort((a, b) => b.year - a.year);
};
