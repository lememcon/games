import { VisuallyHidden } from "@mantine/core";

import { formatBounds } from "@/lib/games";
import type { Bounds } from "@/types";

interface PlayerRangeProps {
  bounds: Bounds;
  // BGG's range when an admin restricted it; shown struck through beside it.
  original?: Bounds | null;
}

// A player count range. Unrestricted games read as before; a restricted one
// shows the effective range in the accent color with BGG's struck through.
const PlayerRange = ({ bounds, original }: PlayerRangeProps) => {
  if (!original) return <>{formatBounds(bounds)}</>;
  const was = formatBounds(original);
  return (
    <span className="player-range">
      <span className="player-range__now">{formatBounds(bounds)}</span>
      <s className="player-range__was" aria-hidden>
        {was}
      </s>
      <VisuallyHidden>(restricted from {was})</VisuallyHidden>
    </span>
  );
};

export default PlayerRange;
