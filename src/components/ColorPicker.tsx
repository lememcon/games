import { useState } from "react";

import { Alert, Button, Group, Stack, Text } from "@mantine/core";

import useColor from "@/hooks/useColor";
import { PALETTE } from "@/lib/colors";

// Names for the palette entries, in PALETTE order.
const NAMES = ["red", "blue", "amber", "green", "purple"];

interface ColorPickerProps {
  // The member's current pick; null means automatic.
  color: string | null;
  // Refreshes the account after a save.
  onSaved: () => void;
}

// Swatches for the name color, plus "Automatic" to go back to the app's own
// choice. Selecting saves straight away; each swatch is an aria-pressed button
// so the state reads without relying on color alone.
const ColorPicker = ({ color, onSaved }: ColorPickerProps) => {
  const [current, setCurrent] = useState(color);
  const [saved, setSaved] = useState(false);
  const { save, saving, error } = useColor(onSaved);

  const choose = async (next: string | null) => {
    if (next === current) return;
    setSaved(false);
    const result = await save(next);
    if (result) {
      setCurrent(result.color);
      setSaved(true);
    }
  };

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Your color
      </Text>
      <Text size="xs" c="dimmed">
        Other members see your name in this color in the score tables.
      </Text>
      <Group gap="xs">
        {PALETTE.map((hex, i) => (
          <button
            key={hex}
            type="button"
            aria-label={NAMES[i]}
            aria-pressed={current === hex}
            disabled={saving}
            onClick={() => choose(hex)}
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: hex,
              border: "2px solid var(--mantine-color-body)",
              outline:
                current === hex
                  ? "2px solid var(--mantine-color-text)"
                  : "1px solid var(--mantine-color-default-border)",
              cursor: "pointer",
            }}
          />
        ))}
        <Button
          variant="default"
          size="compact-sm"
          aria-pressed={current === null}
          disabled={saving}
          onClick={() => choose(null)}
        >
          Automatic
        </Button>
      </Group>
      {saved && <Alert color="green">Saved.</Alert>}
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
    </Stack>
  );
};

export default ColorPicker;
