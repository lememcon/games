import { useState } from "react";

import { Button, Group, Text } from "@mantine/core";

import { resolveImage } from "@/lib/games";
import bundledImages from "@/lib/images";

interface VetoRowProps {
  bggId: number;
  name: string | null;
  image?: string | null;
  ext?: string | null;
  // Renders an Undo button when given; read-only rows omit it.
  undo?: { label: string; disabled: boolean; onClick: () => void };
}

const VetoRow = ({ bggId, name, image, ext, undo }: VetoRowProps) => {
  const [failed, setFailed] = useState(false);
  const cover = resolveImage(String(bggId), { image, ext }, bundledImages);
  return (
    <Group justify="space-between" wrap="nowrap">
      <div className="tray-cover tray-cover--xs">
        {cover && !failed ? (
          <img
            src={cover}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="tray-cover__blank" aria-hidden />
        )}
      </div>
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
};

export default VetoRow;
