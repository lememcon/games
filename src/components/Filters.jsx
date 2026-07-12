import { Checkbox, MultiSelect } from "@mantine/core";

const Filters = ({
  players,
  playerOptions,
  onPlayersChange,
  hidePlayed,
  onHidePlayedChange,
}) => (
  <>
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
    <Checkbox
      checked={hidePlayed}
      onChange={(event) => onHidePlayedChange(event.currentTarget.checked)}
      style={{ margin: "1em 0" }}
      label="Hide played games"
    />
  </>
);

export default Filters;
