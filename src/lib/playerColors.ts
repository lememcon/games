import { createContext } from "react";

// The global player -> color map, built once from every player (see App) so a
// person keeps the same color in the filter, the score breakdown, and the
// detail page. Empty by default; names fall back to the first palette color.
export const PlayerColorContext = createContext<Record<string, string>>({});
export const PlayerColorProvider = PlayerColorContext.Provider;
