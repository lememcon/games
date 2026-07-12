import { createContext, useContext } from "react";

import { PALETTE } from "@/lib/colors";

// The global player -> color map, built once from every player (see App) so a
// person keeps the same color in the filter, the score breakdown, and the
// detail page. Empty by default; names fall back to the first palette color.
const PlayerColorContext = createContext<Record<string, string>>({});
export const PlayerColorProvider = PlayerColorContext.Provider;

// A player's name in their assigned identity color.
const PlayerName = ({ name }: { name: string }) => {
  const color = useContext(PlayerColorContext)[name] ?? PALETTE[0];
  return <span style={{ color, fontWeight: 700 }}>{name}</span>;
};

export default PlayerName;
