import { Link, Route, Switch } from "wouter";

import {
  AppShell,
  Button,
  Checkbox,
  Group,
  InputLabel,
  MantineProvider,
  MenuItem,
  MultiSelect,
  Popover,
  Select,
  Table,
  createTheme,
} from "@mantine/core";

import Game from "@/components/Game";
import useData from "@/hooks/useData";

import "@mantine/core/styles.css";
import "@/assets/styles.css";

import { useLocation } from "wouter";

import {
  addIndex,
  assoc,
  descend,
  forEach,
  identity,
  keys,
  map,
  pick,
  prop,
  sort,
  sortBy,
  values,
} from "ramda";

import bgg from "@/assets/bgg.svg";
import game_data from "@/assets/games.json";
import logo from "@/assets/logo.png";
import useLocalState from "@/hooks/useLocalState";
import usePlayedCounts from "@/hooks/usePlayedCounts";
import { Score } from "./util";

const images = import.meta.glob("@/assets/games/*", {
  eager: true,
  import: "default",
});
const theme = createTheme({
  colors: {
    blue: [
      "#e3f9ff",
      "#d2edfc",
      "#a8d8f2",
      "#7ac2e9",
      "#55afe1",
      "#3da4dd",
      "#2c9edc",
      "#198ac4",
      "#017ab0",
      "#006a9d",
    ],
  },
});
const startYear = 2025;
const currentYear = new Date().getFullYear();

// Generate list of all years
const allYears = [];
for (let i = startYear; i <= currentYear; i++) {
  allYears.push(`${i}`);
}

function App() {
  const [year, setYear] = useLocalState("year", `${currentYear}`);
  const data = useData(year);
  const [players, setPlayers] = useLocalState("players", []);
  const [hidePlayed, setHidePlayed] = useLocalState("hide_played", false);
  const [getPlayedCount, incPlayedCount, decPlayedCount] =
    usePlayedCounts(year);
  const [_, setLocation] = useLocation();

  const num_players = players.length || 0;
  const individual_max = data.max;
  const selected_max =
    players.length === 0
      ? data.max * Object.keys(data.by_player).length
      : data.max * num_players;
  const selected_games = {};

  const handleYear = (year) => {
    setPlayers([]);
    setYear(year);
    setLocation("/");
  };

  forEach(
    (player) => {
      forEach((item) => {
        if (!(item.game in selected_games)) {
          const id = `${item.bgg_id}`;
          const data = game_data[id];

          let min = 0;
          let max = 99;
          if (data && data.players) {
            min = data.players.min;
            max = data.players.max;
          }

          if (hidePlayed && getPlayedCount(id) > 0) {
            return;
          }
          if (num_players > 1 && (num_players < min || num_players > max)) {
            return;
          }

          selected_games[item.game] = {
            name: item.game,
            score: 0,
            id,
            min,
            max,
          };

          if (data && data.image) {
            selected_games[item.game]["image"] =
              images[`/src/assets/games/${id}${data.ext}`];
          }
        }
        const game = selected_games[item.game];
        selected_games[item.game] = assoc(
          "score",
          game.score + item.score,
          assoc(
            "players",
            assoc(
              player,
              assoc("name", player, pick(["rank", "score"], item)),
              game.players || {},
            ),
            game,
          ),
        );
      }, data.by_player[player] || []);
    },
    (players.length > 0 ? players : keys(data.by_player)) || [],
  );
  const games = addIndex(map)(
    (game, i) => {
      const data = game_data[game.id];
      const played = getPlayedCount(game.id);
      return (
        <Table.Tr key={game.name}>
          <Table.Td>{i + 1}.</Table.Td>
          <Table.Td>
            <img src={game.image} width="50" />
          </Table.Td>
          <Table.Td>
            <Link href={`/games/${game.id}`}>{game.name}</Link>
          </Table.Td>
          <Table.Td>
            <Popover withArrow arrowPosition="side" arrowSize={12} shadow="lg">
              <Popover.Target>
                <div>
                  <Score score={game.score} max={selected_max} />
                </div>
              </Popover.Target>
              <Popover.Dropdown>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Player</Table.Th>
                      <Table.Th>Rank</Table.Th>
                      <Table.Th>Score</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {map(
                      (player) => {
                        const key = `${game.name}-${player.name}`;

                        return (
                          <Table.Tr key={key}>
                            <Table.Td>{player.name}</Table.Td>
                            <Table.Td>{player.rank}</Table.Td>
                            <Table.Td>
                              <Score
                                score={player.score}
                                max={individual_max}
                              />
                            </Table.Td>
                          </Table.Tr>
                        );
                      },
                      sortBy(prop("rank"), values(game.players)),
                    )}
                  </Table.Tbody>
                </Table>
              </Popover.Dropdown>
            </Popover>
          </Table.Td>
          <Table.Td>
            {data && data.players && `${data.players.min}-${data.players.max}`}
          </Table.Td>
          <Table.Td>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.3em",
                alignItems: "center",
              }}
            >
              <p style={{ margin: 0, padding: 0 }}>{played}</p>
              <div
                style={{ display: "flex", flexDirection: "row", gap: "1em" }}
              >
                <Button
                  size="compact-xs"
                  disabled={played <= 0}
                  onClick={() => decPlayedCount(game.id)}
                >
                  -
                </Button>
                <Button
                  size="compact-xs"
                  onClick={() => incPlayedCount(game.id)}
                >
                  +
                </Button>
              </div>
            </div>
          </Table.Td>
        </Table.Tr>
      );
    },
    sort(descend(prop("score")), values(selected_games)),
  );
  return (
    <MantineProvider defaultColorTheme="auto" theme={theme}>
      <AppShell header={{ height: 60 }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md">
            <img src={logo} height="48px" />
            <h3>LememCon</h3>
            <Select
              id="year"
              value={year}
              data={allYears}
              onChange={handleYear}
            />
            <img src={bgg} height="24px" className="mantine-visible-from-sm" />
          </Group>
        </AppShell.Header>
        <AppShell.Main>
          <Switch>
            <Route path="/games/:id">
              {(params) => <Game data={data} id={params.id} />}
            </Route>
            <Route>
              <MultiSelect
                label="Filter By Players"
                placeholder="Pick Player"
                value={players}
                data={sortBy(identity, keys(data.by_player))}
                description="Which players are included in the list of games"
                onChange={setPlayers}
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
                onChange={(event) => setHidePlayed(event.currentTarget.checked)}
                style={{ margin: "1em 0" }}
                label="Hide played games"
              />
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Rank</Table.Th>
                    <Table.Th>Game</Table.Th>
                    <Table.Th></Table.Th>
                    <Table.Th>Score</Table.Th>
                    <Table.Th>Players</Table.Th>
                    <Table.Th>Played</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{games}</Table.Tbody>
              </Table>{" "}
            </Route>
          </Switch>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

export default App;
