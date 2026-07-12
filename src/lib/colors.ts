// The tray identity's color language. Players and games get a stable color from
// five board-game component hues, and the top three ranks get medal colors.
// Kept here, pure and framework-free, so components and tests share one source
// of truth. The hues are deep enough to read as name text on the light surface
// while still carrying white text as a chip background.

export const PALETTE = [
  "#C4402C", // red
  "#2F6BB8", // blue
  "#8A5D0C", // amber
  "#2C7A48", // green
  "#6D48B0", // purple
];

export const GOLD = "#D89A12";
export const SILVER = "#98A0AC";
export const BRONZE = "#B87A48";

// Assign palette colors to players in a pleasing, stable order: sort the names
// case-insensitively and hand out the palette by position (wrapping with mod),
// so the filter reads as a rainbow down the list and every player keeps one
// color across the app. Returns a name -> color lookup.
export const buildPlayerColors = (names: string[]): Record<string, string> => {
  const colors: Record<string, string> = {};
  [...names]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .forEach((name, i) => {
      colors[name] = PALETTE[i % PALETTE.length];
    });
  return colors;
};

// Medal color for the top three ranks; undefined below the podium.
export const medalColor = (rank: number): string | undefined => {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return undefined;
};
