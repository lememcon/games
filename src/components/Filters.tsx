import { useEffect, useRef, useState } from "react";

import {
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";

import PlayerFilter from "@/components/PlayerFilter";
import { copyText } from "@/lib/clipboard";
import { SORT_MODES, parseSortMode } from "@/lib/games";
import { canShareLink, shareLink } from "@/lib/share";
import type { SortMode } from "@/types";

interface FiltersProps {
  players: string[];
  playerOptions: string[];
  onPlayersChange: (value: string[]) => void;
  hidePlayed: boolean;
  onHidePlayedChange: (value: boolean) => void;
  sortMode: SortMode;
  onSortModeChange: (value: SortMode) => void;
  shown: number;
  total: number;
  shareUrl: string;
}

const COPIED_MS = 1000;

// Shares the URL through the native share sheet when the browser has one (falling
// back to copying if sharing fails), and always offers Copy link; if copying is
// refused, shows the URL to copy by hand.
const CopyLinkButton = ({ url }: { url: string }) => {
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  // Copied/failed state is only valid for the URL it was set for.
  const copied = copiedFor === url;
  const failed = failedFor === url;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(true);
  const sharing = useRef(false);
  const [sharePending, setSharePending] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    clearTimeout(timer.current);
    const ok = await copyText(url);
    if (!mounted.current) return;
    setCopiedFor(ok ? url : null);
    setFailedFor(ok ? null : url);
    if (ok) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedFor(null), COPIED_MS);
    }
  };

  const payload: ShareData = { title: document.title, url };
  const canShare = canShareLink(payload);

  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    setSharePending(true);
    try {
      const result = await shareLink(payload);
      if (result === "failed") await copy();
    } finally {
      sharing.current = false;
      if (mounted.current) setSharePending(false);
    }
  };

  return (
    <Stack gap="xs" align="flex-end">
      <Group gap="xs" justify="flex-end">
        {canShare && (
          <Button
            variant="filled"
            size="compact-sm"
            disabled={sharePending}
            onClick={share}
          >
            Share
          </Button>
        )}
        <Button
          variant="light"
          size="compact-sm"
          color={failed ? "red" : undefined}
          onClick={copy}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </Group>
      <Text size="xs" c="red" aria-live="polite">
        {failed ? "Copy failed" : ""}
      </Text>
      {failed && (
        <TextInput
          readOnly
          size="xs"
          aria-label="Share link"
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </Stack>
  );
};

// The sticky filter bar: pick who's at the table, hide what they've played, and
// keep a live count of how many games survive the filters in view.
const Filters = ({
  players,
  playerOptions,
  onPlayersChange,
  hidePlayed,
  onHidePlayedChange,
  sortMode,
  onSortModeChange,
  shown,
  total,
  shareUrl,
}: FiltersProps) => (
  <div className="tray-filters">
    <PlayerFilter
      players={players}
      playerOptions={playerOptions}
      onPlayersChange={onPlayersChange}
    />
    <Group justify="space-between" align="center" mt="sm">
      <Text size="sm" c="dimmed" ff="monospace">
        {shown} of {total} games
      </Text>
      <Group gap="sm" align="center">
        <SegmentedControl
          size="xs"
          aria-label="Sort games by"
          data={SORT_MODES}
          value={sortMode}
          onChange={(value) => onSortModeChange(parseSortMode(value))}
        />
        <Checkbox
          checked={hidePlayed}
          onChange={(event) => onHidePlayedChange(event.currentTarget.checked)}
          label="Hide games played by selected players"
        />
        <CopyLinkButton url={shareUrl} />
      </Group>
    </Group>
  </div>
);

export default Filters;
