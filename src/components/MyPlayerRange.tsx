import { useState } from "react";

import { Badge, Button, Group, NumberInput, Text } from "@mantine/core";

import { formatBounds, validateMemberOverride } from "@/lib/games";
import type { Bounds } from "@/types";

interface MyPlayerRangeProps {
  // The range the game allows now (the admin override, else BGG's).
  allowed: Bounds;
  // The member's stored range, shown as-is even if it has gone stale.
  stored: Bounds | null;
  saving: boolean;
  error: string | null;
  onSave: (range: Bounds) => void;
  onReset: () => void;
}

// Lets a member narrow the group sizes this game is suggested for when they are
// in the group. The server refuses an unlinked member (shown through `error`).
const MyPlayerRange = ({
  allowed,
  stored,
  saving,
  error,
  onSave,
  onReset,
}: MyPlayerRangeProps) => {
  const [min, setMin] = useState<number | string>((stored ?? allowed).min);
  const [max, setMax] = useState<number | string>((stored ?? allowed).max);
  const checked = validateMemberOverride(min, max, allowed);
  const invalid = "error" in checked ? checked.error : null;
  const range = "range" in checked ? checked.range : null;
  const current = stored ?? allowed;
  const changed =
    range !== null && (range.min !== current.min || range.max !== current.max);
  const messageId = "my-range-error";
  // See PlayerCountsTable: withAria hands aria-describedby back to us.
  const ariaProps = {
    withAria: false,
    "aria-invalid": invalid ? true : undefined,
    "aria-describedby": invalid ? messageId : undefined,
  };

  return (
    <section className="my-range">
      <Text fw={600}>Your player count</Text>
      <Text size="sm" c="dimmed">
        Only suggest this game in groups that include you when the group has
        this many players. You can narrow the range, not widen it.
      </Text>
      <Group gap="xs" mt="xs" wrap="nowrap">
        <NumberInput
          aria-label="Minimum players"
          size="xs"
          w={70}
          min={1}
          max={99}
          allowDecimal={false}
          allowNegative={false}
          hideControls
          error={invalid ? true : undefined}
          {...ariaProps}
          value={min}
          onChange={setMin}
        />
        <Text span>-</Text>
        <NumberInput
          aria-label="Maximum players"
          size="xs"
          w={70}
          min={1}
          max={99}
          allowDecimal={false}
          allowNegative={false}
          hideControls
          error={invalid ? true : undefined}
          {...ariaProps}
          value={max}
          onChange={setMax}
        />
        <Button
          size="xs"
          loading={saving}
          disabled={!changed}
          onClick={() => onSave(range!)}
        >
          Save
        </Button>
        <Button
          size="xs"
          variant="default"
          disabled={saving || !stored}
          onClick={onReset}
        >
          Reset
        </Button>
        {stored && (
          <Badge variant="light" color="orange">
            Your override
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        Allowed now: {formatBounds(allowed)}
      </Text>
      {invalid && (
        <Text size="xs" c="red" id={messageId}>
          {invalid}
        </Text>
      )}
      {error && (
        <Text size="xs" c="red" role="alert">
          {error}
        </Text>
      )}
    </section>
  );
};

export default MyPlayerRange;
