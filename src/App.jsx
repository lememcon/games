import { Search } from "lucide-react";
import { Link, Route, Switch } from "wouter";

import {
  AppShell,
  Button,
  Checkbox,
  Group,
  MantineProvider,
  MultiSelect,
  Table,
} from "@mantine/core";

import Game from "@/components/Game";
import useData from "@/hooks/useData";

import "@mantine/core/styles.css";

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
          <Table.Td
            styles={{
              td: {
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: "10px",
              },
            }}
          >
            <img src={game.image} width="50" />
            <p
              style={{
                lineHeight: "75px",
                margin: 0,
                padding: 0,
              }}
            >
              {game.name}
            </p>
          </Table.Td>
          <Table.Td>{game.score}</Table.Td>
          <Table.Td>
            {data.players.min}-{data.players.max}
          </Table.Td>
          <Table.Td>
            <div style={{ display: "flex", flexDirection: "row", gap: "1em" }}>
              <p style={{ margin: 0, padding: 0 }}>{played}</p>
              <Button
                size="compact-xs"
                disabled={played <= 0}
                onClick={() => decPlayedCount(game.id)}
              >
                -
              </Button>
              <Button size="compact-xs" onClick={() => incPlayedCount(game.id)}>
                +
              </Button>
            </div>
          </Table.Td>
          <Table.Td>
            <Button>
              <Link href={`/games/${game.id}`}>
                <Search color="white" size="16" />
              </Link>
            </Button>
          </Table.Td>
        </Table.Tr>
      );
    },
    sort(descend(prop("score")), values(selected_games)),
  );
  return (
    <MantineProvider defaultColorTheme="auto">
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
                    <Table.Th>Score</Table.Th>
                    <Table.Th>Players</Table.Th>
                    <Table.Th>Played</Table.Th>
                    <Table.Th></Table.Th>
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
