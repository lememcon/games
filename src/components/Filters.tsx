import { Checkbox, Group, MultiSelect, Text } from "@mantine/core";

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
    <MultiSelect
      label="Filter By Players"
      placeholder="Pick Player"
      value={players}
      data={playerOptions}
      description="Which players are included in the list of games"
      onChange={onPlayersChange}
      clearable
      comboboxProps={{
        width: 300,
        position: "bottom-start",
        shadow: "md",
        transitionProps: { transition: "pop", duration: 200 },
      }}
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
