interface VetoToggleProps {
  game: string;
  vetoed: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

// One button that flips a game between vetoed and not. Pressed reads as a
// "Vetoed" badge with a check; unpressed offers "Not for me".
const VetoToggle = ({ game, vetoed, disabled, onToggle }: VetoToggleProps) => (
  <button
    type="button"
    className={`tray-played tray-played--veto${vetoed ? " tray-played--on" : ""}`}
    aria-pressed={vetoed}
    aria-label={`Veto: ${game}`}
    disabled={disabled}
    onClick={onToggle}
  >
    {vetoed ? (
      <>
        <span aria-hidden>✓</span> Vetoed
      </>
    ) : (
      "Not for me"
    )}
  </button>
);

export default VetoToggle;
