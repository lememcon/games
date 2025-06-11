import { Link, Route, Switch } from "wouter";

import {
  AppShell,
  Button,
  Checkbox,
  Group,
  MantineProvider,
  MultiSelect,
  Table,
  createTheme,
} from "@mantine/core";

import Game from "@/components/Game";
import useData from "@/hooks/useData";

import "@mantine/core/styles.css";
import "@/assets/styles.css";

import {
  assoc,
  descend,
  forEach,
  identity,
  keys,
  map,
  prop,
  sort,
  sortBy,
  values,
} from "ramda";

import game_data from "@/assets/games.json";
import logo from "@/assets/logo.png";
import useLocalState from "@/hooks/useLocalState";
import usePlayedCounts from "@/hooks/usePlayedCounts";

const images = import.meta.glob("./assets/games/*", {
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

function App() {
  const data = useData();
  const [players, setPlayers] = useLocalState("players", []);
  const [hidePlayed, setHidePlayed] = useLocalState("hide_played", false);
  const [getPlayedCount, incPlayedCount, decPlayedCount] = usePlayedCounts();

  const num_players = players.length || 0;
  const selected_games = {};

  forEach(
    (player) => {
      forEach((item) => {
        if (!(item.game in selected_games)) {
          const id = `${item.bgg_id}`;
          const data = game_data[id];
          const min = data.players.min;
          const max = data.players.max;

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

          if (data.image) {
            selected_games[item.game]["image"] =
              images[`./assets/games/${id}${data.ext}`];
          }
        }
        const game = selected_games[item.game];
        selected_games[item.game] = assoc(
          "score",
          game.score + item.score,
          game,
        );
      }, data.by_player[player] || []);
    },
    (players.length > 0 ? players : keys(data.by_player)) || [],
  );
  const games = map(
    (game) => {
      const data = game_data[game.id];
      const played = getPlayedCount(game.id);
      return (
        <Table.Tr key={game.name}>
          <Table.Td>
            <img src={game.image} width="50" />
          </Table.Td>
          <Table.Td>
            <Link href={`/games/${game.id}`}>{game.name}</Link>
          </Table.Td>
          <Table.Td>{game.score}</Table.Td>
          <Table.Td>
            {data.players.min}-{data.players.max}
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
