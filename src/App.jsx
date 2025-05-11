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

import logo from "@/assets/logo.png";

function App() {
  const [opened, { toggle }] = useDisclosure();
  const data = useData();
  const [players, setPlayers] = useState([]);

  const selected_games = {};
  forEach(
    (player) => {
      forEach((item) => {
        if (!(item.game in selected_games)) {
          selected_games[item.game] = { name: item.game, score: 0 };
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
      return (
        <Table.Tr key={game.name}>
          <Table.Td>{game.name}</Table.Td>
          <Table.Td>{game.score}</Table.Td>
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
