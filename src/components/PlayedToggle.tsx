interface PlayedToggleProps {
  game: string;
  played: boolean;
  onToggle: () => void;
}

// One button that flips a game between played and not played. Pressed reads as
// a "Played" badge with a check; unpressed offers "Mark played".
const PlayedToggle = ({ game, played, onToggle }: PlayedToggleProps) => (
  <button
    type="button"
    className={`tray-played${played ? " tray-played--on" : ""}`}
    aria-pressed={played}
    aria-label={`${played ? "Played" : "Mark played"}: ${game}`}
    onClick={onToggle}
  >
    {played ? (
      <>
        <span aria-hidden>✓</span> Played
      </>
    ) : (
      "Mark played"
    )}
  </button>
);

export default PlayedToggle;
