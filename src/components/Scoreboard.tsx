import type { ReactNode } from "react";
import { Link, Route, Switch, useLocation } from "wouter";

import { AppShell, Button, Skeleton, Stack, Text, Title } from "@mantine/core";

import { keys } from "ramda";

import Filters from "@/components/Filters";
import Game from "@/components/Game";
import GamesList from "@/components/GamesList";
import Header from "@/components/Header";
import { PlayerColorProvider } from "@/components/PlayerName";
import useData from "@/hooks/useData";
import useGames from "@/hooks/useGames";
import useLocalState from "@/hooks/useLocalState";
import usePlayedCounts from "@/hooks/usePlayedCounts";
import useYears from "@/hooks/useYears";
import { buildPlayerColors } from "@/lib/colors";
import { buildSelectedGames, computeMaxScores } from "@/lib/games";
import images from "@/lib/images";
import type { ApprovedUser } from "@/types";

interface ScoreboardProps {
  user: ApprovedUser;
}

const Notice = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <Stack align="center" gap="xs" mt="xl">
    <Title order={3}>{title}</Title>
    <Text c="dimmed" ta="center" component="div">
      {children}
    </Text>
  </Stack>
);

function Scoreboard({ user }: ScoreboardProps) {
  const { years, loading: yearsLoading, error: yearsError } = useYears();
  const {
    games: game_data,
    loading: gamesLoading,
    error: gamesError,
  } = useGames();
  const [storedYear, setYear] = useLocalState("year", "");
  // Years are strings (useLocalState stores strings). A stored year that has no
  // scores falls back to the newest one; null until the list is known.
  const year =
    yearsLoading || yearsError
      ? null
      : years.includes(storedYear)
        ? storedYear
        : (years[years.length - 1] ?? null);
  const data = useData(year);
  const [players, setPlayers] = useLocalState<string[]>("players", []);
  const [hidePlayed, setHidePlayed] = useLocalState("hide_played", false);
  const [getPlayedCount, incPlayedCount, decPlayedCount] = usePlayedCounts(
    year ?? "",
  );
  const [_, setLocation] = useLocation();

  const { individualMax, selectedMax } = computeMaxScores(data, players);
  const playerColors = buildPlayerColors(keys(data.by_player));
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
    <PlayerColorProvider value={playerColors}>
      <AppShell header={{ height: 60 }} padding="md">
        <Header
          year={year ?? ""}
          years={years}
          onYearChange={handleYear}
          user={user}
        />
        <AppShell.Main>
          {yearsError ? (
            <Notice title="Couldn't load the years">
              The list of years didn&apos;t load. Check your connection and
              refresh the page.
            </Notice>
          ) : gamesError ? (
            <Notice title="Couldn't load the game details">
              The game details didn&apos;t load. Check your connection and
              refresh the page.
            </Notice>
          ) : yearsLoading ||
            gamesLoading ||
            (year !== null && data.loading) ? (
            <Stack gap="sm" mt="md">
              <Skeleton height={44} radius="md" />
              <Skeleton height={44} radius="md" />
              <Skeleton height={44} radius="md" />
              <Skeleton height={44} radius="md" />
            </Stack>
          ) : year === null ? (
            <Notice title="No scores yet">
              No years have been imported yet.
              {user.role === "admin" && (
                <Button
                  component={Link}
                  href="/admin/import"
                  variant="light"
                  mt="xs"
                >
                  Import scores
                </Button>
              )}
            </Notice>
          ) : data.error ? (
            <Notice title="Couldn't load the scores">
              The {year} scores didn&apos;t load. Check your connection and
              refresh the page.
            </Notice>
          ) : (
            <Switch>
              <Route path="/games/:id">
                {(params) => (
                  <Game data={data} gameData={game_data} id={params.id} />
                )}
              </Route>
              <Route>
                <Filters
                  players={players}
                  playerOptions={keys(data.by_player)}
                  onPlayersChange={setPlayers}
                  hidePlayed={hidePlayed}
                  onHidePlayedChange={setHidePlayed}
                  shown={games.length}
                  total={keys(data.by_game).length}
                />
                {games.length === 0 ? (
                  <Notice title="No games to rank">
                    {players.length > 0
                      ? "None of the ranked games include everyone you picked."
                      : hidePlayed
                        ? "You've played every ranked game. Nice work."
                        : "Scores haven't been posted for this year yet."}
                    {players.length > 0 && (
                      <Button
                        variant="light"
                        mt="xs"
                        onClick={() => setPlayers([])}
                      >
                        Clear players
                      </Button>
                    )}
                  </Notice>
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
    </PlayerColorProvider>
  );
}

export default Scoreboard;
