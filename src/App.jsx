import { useState } from "react";

import {
  AppShell,
  Burger,
  Flex,
  Group,
  MantineProvider,
  MultiSelect,
  Skeleton,
  Table,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

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

const images = import.meta.glob("./assets/games/*", {
  eager: true,
  import: "default",
});
console.log(images);
console.log(game_data);

function App() {
  const [opened, { toggle }] = useDisclosure();
  const data = useData();
  const [players, setPlayers] = useState([]);

  const num_players = players.length;
  const selected_games = {};

  forEach(
    (player) => {
      forEach((item) => {
        if (!(item.game in selected_games)) {
          const id = `${item.bgg_id}`;
          const data = game_data[id];
          const min = data.players.min;
          const max = data.players.max;

          if (num_players > 0 && (num_players < min || num_players > max)) {
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
      }, data.by_player[player]);
    },
    players.length > 0 ? players : keys(data.by_player),
  );
  const games = map(
    (game) => {
      const data = game_data[game.id];
      console.log(game);
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
        </Table.Tr>
      );
    },
    sort(descend(prop("score")), values(selected_games)),
  );
  return (
    <MantineProvider defaultColorTheme="auto">
      <AppShell
        header={{ height: 60 }}
        navbar={{
          width: 300,
          breakpoint: "sm",
          collapsed: { mobile: !opened },
        }}
        padding="md"
      >
        <AppShell.Header>
          <Group h="100%" px="md">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <img src={logo} height="48px" />
            <h3>LememCon</h3>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="md"></AppShell.Navbar>
        <AppShell.Main>
          <MultiSelect
            label="Filter By Players"
            placeholder="Pick Player"
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
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Game</Table.Th>
                <Table.Th>Score</Table.Th>
                <Table.Th>Players</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{games}</Table.Tbody>
          </Table>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

export default App;
