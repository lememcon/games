import { useEffect, useMemo, type ReactNode } from "react";
import { Link, Redirect, useLocation } from "wouter";

import { AppShell, Button, Skeleton, Stack, Text, Title } from "@mantine/core";

import { keys } from "ramda";

import Filters from "@/components/Filters";
import Game from "@/components/Game";
import GamesList from "@/components/GamesList";
import Header from "@/components/Header";
import SplitSuggestions from "@/components/SplitSuggestions";
import useAllPlayedCounts from "@/hooks/useAllPlayedCounts";
import useData from "@/hooks/useData";
import useGames from "@/hooks/useGames";
import useLocalState from "@/hooks/useLocalState";
import usePlayedCounts from "@/hooks/usePlayedCounts";
import useYears from "@/hooks/useYears";
import { buildPlayerColors } from "@/lib/colors";
import {
  buildSelectedGames,
  computeMaxScores,
  playerCountsByName,
  suggestSplits,
} from "@/lib/games";
import images from "@/lib/images";
import { PlayerColorProvider } from "@/lib/playerColors";
import { gamePath, parseScoreboardPath, yearPath } from "@/lib/routes";
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
  const [storedYear, setStoredYear] = useLocalState("year", "");
  const [location, setLocation] = useLocation();
  const route = parseScoreboardPath(location);
  // Years are strings. The URL decides the year; it counts only once the list
  // is known and contains it, so a bogus year never fetches scores.
  const yearsKnown = !yearsLoading && !yearsError;
  const urlYear = route.kind === "year" ? route.year : null;
  const year =
    yearsKnown && urlYear !== null && years.includes(urlYear) ? urlYear : null;
  // Where bare / and legacy /games/:id go: the last viewed year if it still has
  // scores, else the newest.
  const defaultYear = years.includes(storedYear)
    ? storedYear
    : (years[years.length - 1] ?? null);
  const data = useData(year);
  const [players, setPlayers] = useLocalState<string[]>("players", []);
  const [hidePlayed, setHidePlayed] = useLocalState("hide_played", false);
  const [getPlayedCount, incPlayedCount, decPlayedCount, ownCounts] =
    usePlayedCounts(year ?? "");
  const allCounts = useAllPlayedCounts(year ?? "");
  // The member's own edits show at once, so they replace their fetched entry
  // (the fetched counts are only refreshed when the year changes).
  const playerCounts = useMemo(
    () =>
      playerCountsByName(
        data.by_player,
        ownCounts ? { ...allCounts, [user.discordId]: ownCounts } : allCounts,
      ),
    [data.by_player, allCounts, ownCounts, user.discordId],
  );

  // Remember the viewed year as the default for bare /. Keyed on [year] only:
  // the useLocalState setters change identity every render.
  useEffect(() => {
    if (year === null || year === storedYear) return;
    if (storedYear !== "") setPlayers([]);
    setStoredYear(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters are unstable
  }, [year]);

  const { individualMax, selectedMax } = computeMaxScores(data, players);
  const playerColors = buildPlayerColors(keys(data.by_player));
  const games = buildSelectedGames({
    byPlayer: data.by_player,
    players,
    gameData: game_data,
    images,
    hidePlayed,
    playerCounts,
  });
  const splits = useMemo(
    () =>
      suggestSplits({
        byPlayer: data.by_player,
        players,
        gameData: game_data,
        images,
        hidePlayed,
        playerCounts,
      }),
    [data.by_player, players, game_data, hidePlayed, playerCounts],
  );
  const splitSuggestions = (
    <SplitSuggestions
      splits={splits}
      year={year ?? ""}
      individualMax={individualMax}
    />
  );

  const skeleton = (
    <Stack gap="sm" mt="md">
      <Skeleton height={44} radius="md" />
      <Skeleton height={44} radius="md" />
      <Skeleton height={44} radius="md" />
      <Skeleton height={44} radius="md" />
    </Stack>
  );
  const noScores = (
    <Notice title="No scores yet">
      No years have been imported yet.
      {user.role === "admin" && (
        <Button component={Link} href="/admin/import" variant="light" mt="xs">
          Import scores
        </Button>
      )}
    </Notice>
  );

  const handleYear = (year: string | null) => {
    if (year === null) return;
    setPlayers([]);
    setLocation(yearPath(year));
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
          ) : yearsLoading ? (
            skeleton
          ) : route.kind === "unknown" ? (
            <Redirect key="unknown" to="/" replace />
          ) : defaultYear === null ? (
            noScores
          ) : route.kind === "home" ? (
            <Redirect key="home" to={yearPath(defaultYear)} replace />
          ) : route.kind === "legacyGame" ? (
            <Redirect
              key="legacy"
              to={gamePath(defaultYear, route.id)}
              replace
            />
          ) : year === null ? (
            <Notice title="Unknown year">
              There are no scores for {route.year}.{" "}
              <Link href={yearPath(years[years.length - 1])}>
                View {years[years.length - 1]}
              </Link>
            </Notice>
          ) : gamesError ? (
            <Notice title="Couldn't load the game details">
              The game details didn&apos;t load. Check your connection and
              refresh the page.
            </Notice>
          ) : gamesLoading || data.loading ? (
            skeleton
          ) : data.error ? (
            <Notice title="Couldn't load the scores">
              The {year} scores didn&apos;t load. Check your connection and
              refresh the page.
            </Notice>
          ) : route.gameId !== undefined ? (
            <Game
              data={data}
              gameData={game_data}
              id={route.gameId}
              year={year}
            />
          ) : (
            <>
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
                <>
                  <Notice title="No games to rank">
                    {players.length > 0
                      ? hidePlayed
                        ? "No ranked games are left that include everyone you picked and haven't been played by them."
                        : "None of the ranked games include everyone you picked."
                      : hidePlayed
                        ? "Everyone has played every ranked game. Nice work."
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
                  {splitSuggestions}
                </>
              ) : (
                <GamesList
                  afterPodium={splitSuggestions}
                  games={games}
                  year={year}
                  selectedMax={selectedMax}
                  individualMax={individualMax}
                  gameData={game_data}
                  getPlayedCount={getPlayedCount}
                  onInc={incPlayedCount}
                  onDec={decPlayedCount}
                />
              )}
            </>
          )}
        </AppShell.Main>
      </AppShell>
    </PlayerColorProvider>
  );
}

export default Scoreboard;
