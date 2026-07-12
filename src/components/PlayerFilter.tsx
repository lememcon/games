import { PALETTE } from "@/lib/colors";

interface PlayerFilterProps {
  players: string[];
  playerOptions: string[];
  onPlayersChange: (value: string[]) => void;
}

// A wall of toggle chips, one per player. Selecting a player fills their chip
// with their own palette color; unselected chips wear the name in that color on
// white. Each chip is a real aria-pressed button so the state reads without
// relying on color alone.
const PlayerFilter = ({
  players,
  playerOptions,
  onPlayersChange,
}: PlayerFilterProps) => {
  const toggle = (name: string) =>
    onPlayersChange(
      players.includes(name)
        ? players.filter((p) => p !== name)
        : [...players, name],
    );

  const hasSelection = players.length > 0;
  const sorted = [...playerOptions].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );

  return (
    <div className="player-filter">
      <div className="player-filter__head">
        <span className="tray-eyebrow">Filter By Players</span>
        {/* Always mounted so it reserves its space and never shifts the page;
            only shown (and reachable) once something is selected. */}
        <button
          type="button"
          className="player-filter__clear"
          onClick={() => onPlayersChange([])}
          aria-hidden={!hasSelection}
          tabIndex={hasSelection ? undefined : -1}
          style={{ visibility: hasSelection ? "visible" : "hidden" }}
        >
          Clear
        </button>
      </div>
      <div className="player-filter__chips">
        {sorted.map((name, i) => {
          const color = PALETTE[i % PALETTE.length];
          const selected = players.includes(name);
          return (
            <button
              key={name}
              type="button"
              className="player-chip"
              aria-pressed={selected}
              onClick={() => toggle(name)}
              style={
                selected
                  ? { background: color, borderColor: color, color: "#fff" }
                  : { color }
              }
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PlayerFilter;
