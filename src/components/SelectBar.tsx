import { Button } from "@mantine/core";

interface SelectBarProps {
  count: number;
  // True while saving; also disables Apply at zero selected.
  disabled: boolean;
  onApply: () => void;
  onCancel: () => void;
}

// Sticky bottom bar for bulk selection. The count stays mounted so the live
// region announces changes.
const SelectBar = ({ count, disabled, onApply, onCancel }: SelectBarProps) => (
  <div className="select-bar">
    <span className="select-bar__count" aria-live="polite">
      {count} selected
    </span>
    <div className="select-bar__actions">
      <Button size="xs" disabled={disabled || count === 0} onClick={onApply}>
        Not for me
      </Button>
      <Button size="xs" variant="default" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </div>
);

export default SelectBar;
