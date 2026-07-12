import { Checkbox, Group, Text } from "@mantine/core";

import PlayerFilter from "@/components/PlayerFilter";

interface FiltersProps {
  players: string[];
  playerOptions: string[];
  onPlayersChange: (value: string[]) => void;
  hidePlayed: boolean;
  onHidePlayedChange: (value: boolean) => void;
  shown: number;
  total: number;
}

// The sticky filter bar: pick who's at the table, hide what you've played, and
// keep a live count of how many games survive the filters in view.
const Filters = ({
  players,
  playerOptions,
  onPlayersChange,
  hidePlayed,
  onHidePlayedChange,
  shown,
  total,
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
      <Checkbox
        checked={hidePlayed}
        onChange={(event) => onHidePlayedChange(event.currentTarget.checked)}
        label="Hide played games"
      />
    </Group>
  </div>
);

export default Filters;
