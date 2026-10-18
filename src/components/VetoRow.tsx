import { Link } from "wouter";

import { Button, Group, Text } from "@mantine/core";

import GameCover from "@/components/GameCover";
import { gamePath } from "@/lib/routes";

interface VetoRowProps {
  bggId: number;
  name: string | null;
  image?: string | null;
  cover?: string | null;
  // Year-scoped rows link to that year's game page; permanent vetoes use the legacy redirect.
  year?: number | string;
  // Renders an Undo button when given; read-only rows omit it.
  undo?: { label: string; disabled: boolean; onClick: () => void };
}

const VetoRow = ({ bggId, name, image, cover, year, undo }: VetoRowProps) => {
  return (
    <Group justify="space-between" wrap="nowrap">
      <GameCover image={image} cover={cover} />
      <Text
        component={Link}
        href={year !== undefined ? gamePath(year, bggId) : `/games/${bggId}`}
        flex={1}
        miw={0}
        style={{ overflowWrap: "anywhere" }}
      >
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
};

export default VetoRow;
