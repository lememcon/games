interface PlayedCounterProps {
  count: number;
  onInc: () => void;
  onDec: () => void;
}

// Compact inline stepper: a "Played N×" label beside neutral square −/+ buttons,
// matching the tray's paper-tan controls. Decrement is disabled at zero.
const PlayedCounter = ({ count, onInc, onDec }: PlayedCounterProps) => (
  <div className="tray-played">
    <span className="tray-played__label">
      {count > 0 ? `Played ${count}×` : "Not Played"}
    </span>
    <div className="tray-played__steps">
      <button
        type="button"
        className="tray-step"
        onClick={onDec}
        disabled={count <= 0}
      >
        -
      </button>
      <button type="button" className="tray-step" onClick={onInc}>
        +
      </button>
    </div>
  </div>
);

export default PlayedCounter;
