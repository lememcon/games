// The tray identity's color language. Players and games get a stable color from
// the classic five board-game component colors (tuned down from primary), and
// the top three ranks get medal colors. Kept here, pure and framework-free, so
// components and tests share one source of truth.

export const PALETTE = [
  "#E5533D", // red
  "#3B7DD8", // blue
  "#E2A50E", // yellow
  "#4CAF6E", // green
  "#8A63C4", // purple
];

export const GOLD = "#D89A12";
export const SILVER = "#98A0AC";
export const BRONZE = "#B87A48";

// Deterministic palette color for a string key (a player or game name), so the
// same person or game always shows the same token color across the app.
export const paletteColor = (key: string): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

// Medal color for the top three ranks; undefined below the podium.
export const medalColor = (rank: number): string | undefined => {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return undefined;
};
