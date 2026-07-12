import { Route, Switch, useLocation } from "wouter";

import { AppShell, MantineProvider, createTheme } from "@mantine/core";

import { identity, keys, sortBy } from "ramda";

import game_data from "@/assets/games.json";
import Filters from "@/components/Filters";
import Game from "@/components/Game";
import GamesTable from "@/components/GamesTable";
import Header from "@/components/Header";
import useData from "@/hooks/useData";
import useLocalState from "@/hooks/useLocalState";
import usePlayedCounts from "@/hooks/usePlayedCounts";
import { buildSelectedGames, computeMaxScores } from "@/lib/games";

import "@mantine/core/styles.css";
import "@/assets/styles.css";

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

  const { individualMax, selectedMax } = computeMaxScores(data, players);
  const games = buildSelectedGames({
    byPlayer: data.by_player,
    players,
    gameData: game_data,
    images,
    hidePlayed,
    getPlayedCount,
  });

  const handleYear = (year) => {
    setPlayers([]);
    setYear(year);
    setLocation("/");
  };

  return (
    <MantineProvider defaultColorTheme="auto" theme={theme}>
      <AppShell header={{ height: 60 }} padding="md">
        <Header year={year} years={allYears} onYearChange={handleYear} />
        <AppShell.Main>
          <Switch>
            <Route path="/games/:id">
              {(params) => <Game data={data} id={params.id} />}
            </Route>
            <Route>
              <Filters
                players={players}
                playerOptions={sortBy(identity, keys(data.by_player))}
                onPlayersChange={setPlayers}
                hidePlayed={hidePlayed}
                onHidePlayedChange={setHidePlayed}
              />
              <GamesTable
                games={games}
                selectedMax={selectedMax}
                individualMax={individualMax}
                gameData={game_data}
                getPlayedCount={getPlayedCount}
                onInc={incPlayedCount}
                onDec={decPlayedCount}
              />
            </Route>
          </Switch>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

export default App;
