import { Button, Group, Text } from "@mantine/core";

interface VetoRowProps {
  bggId: number;
  name: string | null;
  // Renders an Undo button when given; read-only rows omit it.
  undo?: { label: string; disabled: boolean; onClick: () => void };
}

const VetoRow = ({ bggId, name, undo }: VetoRowProps) => (
  <Group justify="space-between" wrap="nowrap">
    <Text flex={1} miw={0} style={{ overflowWrap: "anywhere" }}>
      {name ?? `Game ${bggId}`}
    </Text>
    {undo && (
      <Button
        size="xs"
        variant="default"
        style={{ flex: "none" }}
        aria-label={undo.label}
        disabled={undo.disabled}
        onClick={undo.onClick}
      >
        Undo
      </Button>
    )}
  </Group>
);

export default VetoRow;
