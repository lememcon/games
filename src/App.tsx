import { Route, Switch, useLocation } from "wouter";

import {
  AppShell,
  Button,
  MantineProvider,
  Skeleton,
  Stack,
  Text,
  Title,
  createTheme,
} from "@mantine/core";

import { identity, keys, sortBy } from "ramda";

import game_data from "@/assets/games.json";
import Filters from "@/components/Filters";
import Game from "@/components/Game";
import GamesList from "@/components/GamesList";
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
}) as Record<string, string>;
// Component-tray identity: a rounded, friendly display face, an amber
// victory-point accent, and a monospace face for the scores so digits line up
// like a scorepad. The light paper surfaces live in src/assets/styles.css.
const theme = createTheme({
  primaryColor: "amber",
  primaryShade: 6,
  colors: {
    amber: [
      "#fbf3e0",
      "#f4e7c6",
      "#e9cd8d",
      "#dfb457",
      "#d79f2c",
      "#d1961d",
      "#c9871c",
      "#a86e12",
      "#8a5d0c",
      "#6f4706",
    ],
  },
  defaultRadius: "md",
  fontFamily:
    "'Trebuchet MS', 'Segoe UI', system-ui, Helvetica, Arial, sans-serif",
  fontFamilyMonospace:
    "'SF Mono', 'JetBrains Mono', 'Roboto Mono', ui-monospace, Menlo, Consolas, monospace",
  headings: {
    fontFamily:
      "'Trebuchet MS', 'Segoe UI', system-ui, Helvetica, Arial, sans-serif",
  },
});
const startYear = 2025;
const currentYear = new Date().getFullYear();

// Generate list of all years
const allYears: string[] = [];
for (let i = startYear; i <= currentYear; i++) {
  allYears.push(`${i}`);
}

function App() {
  const [year, setYear] = useLocalState("year", `${currentYear}`);
  const data = useData(year);
  const [players, setPlayers] = useLocalState<string[]>("players", []);
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

  const handleYear = (year: string | null) => {
    if (year === null) return;
    setPlayers([]);
    setYear(year);
    setLocation("/");
  };

  return (
    <MantineProvider theme={theme}>
      <AppShell header={{ height: 60 }} padding="md">
        <Header year={year} years={allYears} onYearChange={handleYear} />
        <AppShell.Main>
          {data.loading ? (
            <Stack gap="sm" mt="md">
              <Skeleton height={44} radius="md" />
              <Skeleton height={44} radius="md" />
              <Skeleton height={44} radius="md" />
              <Skeleton height={44} radius="md" />
            </Stack>
          ) : data.error ? (
            <Stack align="center" gap="xs" mt="xl">
              <Title order={3}>Couldn&apos;t load the scores</Title>
              <Text c="dimmed" ta="center">
                The {year} scores didn&apos;t load. Check your connection and
                refresh the page.
              </Text>
            </Stack>
          ) : (
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
                  shown={games.length}
                  total={keys(data.by_game).length}
                />
                {games.length === 0 ? (
                  <Stack align="center" gap="xs" mt="xl">
                    <Title order={3}>No games to rank</Title>
                    <Text c="dimmed" ta="center">
                      {players.length > 0
                        ? "None of the ranked games include everyone you picked."
                        : hidePlayed
                          ? "You've played every ranked game. Nice work."
                          : "Scores haven't been posted for this year yet."}
                    </Text>
                    {players.length > 0 && (
                      <Button variant="light" onClick={() => setPlayers([])}>
                        Clear players
                      </Button>
                    )}
                  </Stack>
                ) : (
                  <GamesList
                    games={games}
                    selectedMax={selectedMax}
                    individualMax={individualMax}
                    gameData={game_data}
                    getPlayedCount={getPlayedCount}
                    onInc={incPlayedCount}
                    onDec={decPlayedCount}
                  />
                )}
              </Route>
            </Switch>
          )}
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

export default App;
