import {
  Button,
  Checkbox,
  CopyButton,
  Group,
  SegmentedControl,
  Text,
} from "@mantine/core";

import PlayerFilter from "@/components/PlayerFilter";
import { SORT_MODES, parseSortMode } from "@/lib/games";
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
        <CopyButton value={shareUrl}>
          {({ copied, copy }) => (
            <Button variant="light" size="compact-sm" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          )}
        </CopyButton>
      </Group>
    </Group>
  </div>
);

export default Filters;
