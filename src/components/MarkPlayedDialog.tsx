import { useContext, useState } from "react";

import { Button, Group, Modal, Text } from "@mantine/core";

import { PALETTE } from "@/lib/colors";
import type { MarkPlayedOption } from "@/lib/markPlayed";
import { PlayerColorContext } from "@/lib/playerColors";

interface MarkPlayedDialogProps {
  game: string;
  year: string;
  selfId: string;
  options: MarkPlayedOption[];
  initialSelected: string[];
  onClose: () => void;
  // Rejects with the failure to show; the dialog stays open.
  onConfirm: (discordIds: string[]) => Promise<void>;
}

// Chooses which members a game is marked played for. Chips look and work like
// the player filter's: aria-pressed buttons filled with the player's color.
const MarkPlayedDialog = ({
  game,
  year,
  selfId,
  options,
  initialSelected,
  onClose,
  onConfirm,
}: MarkPlayedDialogProps) => {
  const colors = useContext(PlayerColorContext);
  const [selected, setSelected] = useState(initialSelected);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  const confirm = async () => {
    setSaving(true);
    setError(false);
    try {
      await onConfirm(selected);
    } catch {
      setError(true);
      setSaving(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={`Mark "${game}" played \u00b7 ${year}`}
    >
      <div className="player-filter__chips">
        {options.map((o, i) => {
          const color = colors[o.name] ?? PALETTE[i % PALETTE.length];
          const on = o.discordId !== null && selected.includes(o.discordId);
          return (
            <button
              key={o.discordId ?? o.name}
              type="button"
              className="player-chip"
              aria-pressed={on}
              disabled={o.disabled}
              onClick={() => toggle(o.discordId!)}
              style={{
                ...(on
                  ? { background: color, borderColor: color, color: "#fff" }
                  : { color }),
                ...(o.disabled ? { opacity: 0.5, cursor: "default" } : {}),
              }}
            >
              {o.name}
              {o.discordId === selfId && " (you)"}
              {o.reason && ` \u00b7 ${o.reason}`}
            </button>
          );
        })}
      </div>
      {error && (
        <Text c="red" size="sm" mt="sm" role="alert">
          Couldn&apos;t save. Try again.
        </Text>
      )}
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={confirm}
          loading={saving}
          disabled={selected.length === 0}
        >
          Mark {selected.length} played
        </Button>
      </Group>
    </Modal>
  );
};

export default MarkPlayedDialog;
