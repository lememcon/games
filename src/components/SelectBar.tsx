import { Button } from "@mantine/core";

interface SelectBarProps {
  count: number;
  // True while saving; also disables Apply at zero selected, and Cancel.
  disabled: boolean;
  year: string;
  // False hides the this-year button (no year-veto hook).
  showYear?: boolean;
  onApply: (scope: "all" | "year") => void;
  onCancel: () => void;
}

// Sticky bottom bar for bulk selection. The count stays mounted so the live
// region announces changes.
const SelectBar = ({
  count,
  disabled,
  year,
  showYear = true,
  onApply,
  onCancel,
}: SelectBarProps) => (
  <div className="select-bar">
    <span className="select-bar__count" aria-live="polite">
      {count} selected
    </span>
    <div className="select-bar__actions">
      <Button
        size="xs"
        variant="default"
        disabled={disabled || count === 0}
        onClick={() => onApply("all")}
      >
        Not for me · every year
      </Button>
      {showYear && (
        <Button
          size="xs"
          disabled={disabled || count === 0}
          onClick={() => onApply("year")}
        >
          {`Not in ${year}`}
        </Button>
      )}
      <Button
        size="xs"
        variant="default"
        disabled={disabled}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  </div>
);

export default SelectBar;
