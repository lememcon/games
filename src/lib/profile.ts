export const MAX_DISPLAY_NAME = 32;

// Client-side check mirroring the server's length rule (code points, after
// trimming). A blank name is valid: it clears the display name. The server
// stays the authority on the character rules.
export const displayNameError = (input: string): string | null =>
  [...input.trim()].length > MAX_DISPLAY_NAME
    ? `Use ${MAX_DISPLAY_NAME} characters or fewer.`
    : null;

export const formatWinRate = (rate: number): string =>
  `${Math.round(rate * 100)}%`;

export const formatAvgRank = (rank: number): string => rank.toFixed(1);

export const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
};
