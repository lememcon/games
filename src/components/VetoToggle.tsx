interface VetoToggleProps {
  game: string;
  year: string;
  // Vetoed for every year.
  vetoed: boolean;
  // Vetoed for this year only.
  yearVetoed: boolean;
  disabled?: boolean;
  onOpen: () => void;
}

// One button that opens the veto dialog. The label shows what is set: nothing
// ("Not for me…"), every year ("✓ Vetoed"), or only this year ("✓ Skipped
// 2026"). Either one reads as on.
const VetoToggle = ({
  game,
  year,
  vetoed,
  yearVetoed,
  disabled,
  onOpen,
}: VetoToggleProps) => (
  <button
    type="button"
    className={`tray-played tray-played--veto${vetoed || yearVetoed ? " tray-played--on" : ""}`}
    aria-haspopup="dialog"
    aria-label={`Veto: ${game}`}
    disabled={disabled}
    onClick={onOpen}
  >
    {vetoed ? (
      <>
        <span aria-hidden>✓</span> Vetoed
      </>
    ) : yearVetoed ? (
      <>
        <span aria-hidden>✓</span> Skipped {year}
      </>
    ) : (
      "Not for me…"
    )}
  </button>
);

export default VetoToggle;
