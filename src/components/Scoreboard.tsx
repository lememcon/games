import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";

import { AppShell, Button, Skeleton, Stack, Text, Title } from "@mantine/core";

import { keys } from "ramda";

import Filters from "@/components/Filters";
import Game from "@/components/Game";
import GamesList from "@/components/GamesList";
import Header from "@/components/Header";
import MarkPlayedDialog from "@/components/MarkPlayedDialog";
import SplitSuggestions from "@/components/SplitSuggestions";
import TopPicks from "@/components/TopPicks";
import UnplayedShelf from "@/components/UnplayedShelf";
import VetoDialog from "@/components/VetoDialog";
import { useMarkPlayed } from "@/hooks/useAllPlayed";
import useData from "@/hooks/useData";
import useGames from "@/hooks/useGames";
import useLocalState from "@/hooks/useLocalState";
import usePageMeta from "@/hooks/usePageMeta";
import usePlayed from "@/hooks/usePlayed";
import usePlayerOverrides from "@/hooks/usePlayerOverrides";
import useVetoes from "@/hooks/useVetoes";
import useYearVetoes from "@/hooks/useYearVetoes";
import useYears from "@/hooks/useYears";
import { buildPlayerColors, pickedColors } from "@/lib/colors";
import {
  buildSelectedGames,
  computeMaxScores,
  mergeVetoes,
  parseSortMode,
  playerCountsByName,
  suggestSplits,
} from "@/lib/games";
import images from "@/lib/images";
import { markPlayedOptions } from "@/lib/markPlayed";
import { scoreboardMeta } from "@/lib/pageMeta";
import { PlayerColorProvider } from "@/lib/playerColors";
import {
  buildFilterSearch,
  defaultYear,
  gamePath,
  parseFilterSearch,
  parseScoreboardPath,
  sharePath,
  topPicksPath,
  yearPath,
} from "@/lib/routes";
import { switchVeto } from "@/lib/vetoSwitch";
import type { ApprovedUser } from "@/types";

interface ScoreboardProps {
  user: ApprovedUser;
}

const UNDO_MS = 10_000;

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
  const fallbackYear = defaultYear(years, storedYear);
  const data = useData(year);
  const dataReady = !data.loading && !data.error;
  usePageMeta(
    scoreboardMeta({
      routeYear: route.kind === "year" ? route.year : null,
      gameId: route.kind === "year" ? route.gameId : undefined,
      page: route.kind === "year" ? route.page : undefined,
      // The year is known and its scores and game details are in.
      loaded: year !== null && dataReady && !gamesLoading && !gamesError,
      yearKnown: year !== null,
      yearsLoading,
      gameName:
        route.kind === "year" && route.gameId !== undefined
          ? data.by_id[route.gameId]?.[0]?.game
          : undefined,
    }),
  );
  const [players, setPlayers] = useLocalState<string[]>("players", []);
  const [hidePlayed, setHidePlayed] = useLocalState("hide_played", false);
  const [storedSort, setSortMode] = useLocalState("sort_mode", "total");
  const sortMode = parseSortMode(storedSort);
  const [isPlayed, togglePlayed, ownPlayed, markConfirmed, playedError] =
    usePlayed(year ?? "");
  const [allPlayed, markPlayed, allPlayedError, allPlayedLoaded] =
    useMarkPlayed(year ?? "");
  const [markingId, setMarkingId] = useState<string | null>(null);
  // The game whose veto dialog is open, by bgg id.
  const [vetoingId, setVetoingId] = useState<number | null>(null);
  // A dialog opened for one year must not confirm against another.
  const [markingYear, setMarkingYear] = useState(year);
  if (markingYear !== year) {
    setMarkingYear(year);
    setMarkingId(null);
    setVetoingId(null);
  }
  const gameNames = useMemo(
    () => Object.fromEntries(data.scores.map((r) => [r.bgg_id, r.game])),
    [data.scores],
  );
  // The member's own edits show at once, so they replace their fetched entry
  // (the fetched games are only refreshed when the year changes).
  const everyonesPlayed = useMemo(
    () =>
      ownPlayed ? { ...allPlayed, [user.discordId]: ownPlayed } : allPlayed,
    [allPlayed, ownPlayed, user.discordId],
  );
  const playerPlayed = useMemo(
    () => playerCountsByName(data.by_player, everyonesPlayed),
    [data.by_player, everyonesPlayed],
  );

  const overrides = usePlayerOverrides();
  const playerRanges = useMemo(
    () => playerCountsByName(data.by_player, overrides.all),
    [data.by_player, overrides.all],
  );

  const vetoes = useVetoes();
  const yearVetoes = useYearVetoes(year);
  // The last game vetoed from the list, for the undo bar. A new object per
  // veto, so the timer restarts. The game leaves the list, so the name is
  // captured at click time. The scope says which kind of veto Undo clears.
  const [lastVetoed, setLastVetoed] = useState<{
    id: number;
    name: string;
    // The scope the veto is in now; for a switch, the one it moved to.
    scope: "all" | "year";
    switched?: boolean;
  } | null>(null);
  // A game whose switch failed with no bar to show it on.
  const [switchErrorId, setSwitchErrorId] = useState<number | null>(null);
  // Hover and focus hold the timer separately, so leaving with the mouse does
  // not resume it while focus is still inside the bar.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const barHeld = hovered || focused;
  const undoRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoFocus = useRef(false);
  // Bumped whenever the bar is cleared, so a slow veto that resolves later
  // cannot bring back a bar the member has since moved past.
  const vetoSeq = useRef(0);
  useEffect(() => {
    if (!lastVetoed) return;
    // Only take focus when it is not somewhere the member moved it on purpose.
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      !listRef.current?.contains(active)
    ) {
      return;
    }
    // Focus moved here by us does not hold the timer; the member's does.
    autoFocus.current = true;
    undoRef.current?.focus();
    autoFocus.current = false;
  }, [lastVetoed]);
  // Leaving the list or the year drops the bar, so it is not stale on return.
  const vetoScope = `${year}|${"gameId" in route ? route.gameId : ""}`;
  const [barScope, setBarScope] = useState(vetoScope);
  if (barScope !== vetoScope) {
    setBarScope(vetoScope);
    setLastVetoed(null);
    setSwitchErrorId(null);
  }
  // A veto still saving for the previous scope must not bring the bar back.
  useEffect(() => {
    vetoSeq.current++;
  }, [vetoScope]);
  useEffect(() => {
    if (!lastVetoed || barHeld) return;
    const timer = setTimeout(() => setLastVetoed(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [lastVetoed, barHeld]);
  const addVeto = (scope: "all" | "year", id: number, name: string) => {
    const seq = ++vetoSeq.current;
    setLastVetoed(null);
    setHovered(false);
    setFocused(false);
    const set = scope === "year" ? yearVetoes : vetoes;
    void set.veto(id).then((ok) => {
      if (ok && seq === vetoSeq.current) setLastVetoed({ id, name, scope });
    });
  };
  // A dialog choice. Closes first so the dialog unmounts and focus can reach
  // Undo; removing a veto shows no bar.
  const pickVeto = (
    scope: "all" | "year",
    id: number,
    name: string,
    on: boolean,
  ) => {
    setVetoingId(null);
    if (on) addVeto(scope, id, name);
    else void (scope === "year" ? yearVetoes : vetoes).unveto(id);
  };
  const setOf = (scope: "all" | "year") =>
    scope === "year" ? yearVetoes : vetoes;
  // Moves a veto to the other scope, adding there before removing here. The
  // bar only offers Undo when both steps saved.
  // A switch touches both scopes, so drop any stale error from either.
  const clearErrors = (id: number) => {
    vetoes.clearError(id);
    yearVetoes.clearError(id);
  };
  const doSwitch = (to: "all" | "year", id: number, name: string) => {
    const seq = ++vetoSeq.current;
    setLastVetoed(null);
    setSwitchErrorId(null);
    clearErrors(id);
    setHovered(false);
    setFocused(false);
    void switchVeto(setOf(to === "all" ? "year" : "all"), setOf(to), id).then(
      (ok) => {
        if (seq !== vetoSeq.current) return;
        if (ok) setLastVetoed({ id, name, scope: to, switched: true });
        else setSwitchErrorId(id);
      },
    );
  };
  const barSet = setOf(lastVetoed?.scope ?? "all");
  // Either scope can hold the error, since a switch touches both.
  const errorOf = (id: number) =>
    vetoes.errorFor(id) ?? yearVetoes.errorFor(id);
  // A vetoed game is filtered out of the list, so a failed undo keeps the bar
  // to show its error there.
  const undo = async (id: number) => {
    vetoSeq.current++;
    if (lastVetoed?.switched) clearErrors(id);
    const ok = lastVetoed?.switched
      ? await switchVeto(
          barSet,
          setOf(lastVetoed.scope === "all" ? "year" : "all"),
          id,
        )
      : await barSet.unveto(id);
    if (ok) setLastVetoed(null);
  };
  const dismiss = () => {
    vetoSeq.current++;
    setLastVetoed(null);
  };
  const playerVetoes = useMemo(
    () =>
      playerCountsByName(
        data.by_player,
        mergeVetoes(vetoes.all, yearVetoes.all),
      ),
    [data.by_player, vetoes.all, yearVetoes.all],
  );

  // Filters from a shared link, read once. They wait here until the scores are
  // loaded (so unknown names can be dropped), then replace the saved filters.
  const pending = useRef(parseFilterSearch(window.location.search));
  const isYearList =
    route.kind === "year" &&
    route.gameId === undefined &&
    route.page === undefined;

  // Remember the viewed year as the default for bare /. Keyed on [year] only:
  // the useLocalState setters change identity every render.
  useEffect(() => {
    if (year === null || year === storedYear) return;
    if (storedYear !== "" && pending.current === null) setPlayers([]);
    setStoredYear(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters are unstable
  }, [year]);

  // A shared link only applies to the page it was opened on.
  // The home and legacy redirects keep the query, so the filters ride along.
  const redirecting =
    (route.kind === "home" || route.kind === "legacyGame") &&
    !(yearsKnown && fallbackYear === null);
  useEffect(() => {
    if (redirecting) return;
    if (!isYearList || (yearsKnown && year === null)) pending.current = null;
  });

  // Back/forward changes only the query. useSearch re-renders on it (its value
  // is decoded, so it is never parsed); the raw location is what gets compared.
  useSearch();
  const lastSearch = useRef(window.location.search);
  const applied = useRef<string | null>(null);

  // Apply shared filters once the scores are loaded, then keep the address bar
  // in step with the filters, replacing the history entry. One effect, so the
  // sync never runs against filters that are about to be replaced.
  useEffect(() => {
    const raw = window.location.search;
    if (raw !== lastSearch.current) {
      lastSearch.current = raw;
      if (isYearList) {
        const next = parseFilterSearch(raw);
        // A query equal to what the filters would write is our own replace.
        if (
          next &&
          raw !== buildFilterSearch({ players, hidePlayed, sort: sortMode })
        ) {
          pending.current = next;
        }
      }
    }
    if (year === null || !dataReady) return;
    const current = buildFilterSearch({ players, hidePlayed, sort: sortMode });
    const shared = pending.current;
    if (shared !== null) {
      pending.current = null;
      const names = shared.players.filter((name) =>
        Object.hasOwn(data.by_player, name),
      );
      setPlayers(names);
      setHidePlayed(shared.hidePlayed);
      setSortMode(shared.sort);
      const next = buildFilterSearch({ ...shared, players: names });
      if (next !== current) {
        applied.current = current;
        return;
      }
    }
    if (!isYearList) return;
    // A second run before the new filters render (StrictMode) still holds the
    // old ones: it must not write their query back.
    const stale = applied.current === current;
    applied.current = null;
    if (stale) return;
    if (current !== window.location.search) {
      setLocation(location + current, { replace: true });
      // Our own write is not navigation.
      lastSearch.current = window.location.search;
    }
  });

  const { individualMax, selectedMax } = computeMaxScores(data, players);
  const playerColors = buildPlayerColors(
    keys(data.by_player),
    pickedColors(data.by_player),
  );
  const games = buildSelectedGames({
    byPlayer: data.by_player,
    players,
    gameData: game_data,
    images,
    hidePlayed,
    playerPlayed,
    playerRanges,
    playerVetoes,
    sortMode,
  });
  const splits = useMemo(
    () =>
      suggestSplits({
        byPlayer: data.by_player,
        players,
        gameData: game_data,
        images,
        hidePlayed,
        playerPlayed,
        playerRanges,
        playerVetoes,
        sortMode,
      }),
    [
      data.by_player,
      players,
      game_data,
      hidePlayed,
      playerPlayed,
      playerRanges,
      playerVetoes,
      sortMode,
    ],
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

  // Marking opens the dialog (once the member's own games are in); unmarking
  // is direct.
  const handleToggle = (id: string) => {
    if (isPlayed(id)) togglePlayed(id);
    else if (ownPlayed !== null) setMarkingId(id);
  };

  const markingDialog =
    markingId !== null && year !== null
      ? (() => {
          const { options, selected } = markPlayedOptions({
            byPlayer: data.by_player,
            bggId: markingId,
            selfId: user.discordId,
            selfName: user.displayName ?? user.name,
            playedByDiscord: everyonesPlayed,
          });
          return (
            <MarkPlayedDialog
              game={gameNames[markingId] ?? markingId}
              year={year}
              selfId={user.discordId}
              options={options}
              initialSelected={selected}
              onClose={() => setMarkingId(null)}
              onConfirm={async (ids) => {
                await markPlayed(markingId, ids);
                if (ids.includes(user.discordId)) markConfirmed(markingId);
                setMarkingId(null);
              }}
            />
          );
        })()
      : null;

  const vetoingKey = `${vetoingId}`;
  const vetoingName =
    games.find((g) => g.id === vetoingKey)?.name ??
    gameNames[vetoingKey] ??
    vetoingKey;

  const handleYear = (year: string | null) => {
    if (year === null) return;
    pending.current = null;
    setPlayers([]);
    setLocation(
      route.kind === "year" && route.page === "topPicks"
        ? topPicksPath(year)
        : yearPath(year),
    );
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
          ) : fallbackYear === null ? (
            noScores
          ) : route.kind === "home" ? (
            <Redirect
              key="home"
              to={yearPath(fallbackYear) + window.location.search}
              replace
            />
          ) : route.kind === "legacyGame" ? (
            <Redirect
              key="legacy"
              to={gamePath(fallbackYear, route.id) + window.location.search}
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
          ) : route.page === "topPicks" ? (
            !allPlayedLoaded ? (
              skeleton
            ) : (
              <>
                {allPlayedError && (
                  <Text c="red" size="sm" role="alert">
                    {allPlayedError}
                  </Text>
                )}
                <TopPicks
                  year={year}
                  scores={data.scores}
                  allPlayed={everyonesPlayed}
                  games={game_data}
                />
              </>
            )
          ) : route.gameId !== undefined ? (
            <Game
              data={data}
              gameData={game_data}
              id={route.gameId}
              year={year}
              overrides={overrides}
              vetoes={vetoes}
              yearVetoes={yearVetoes}
              discordId={user.discordId}
              backHref={sharePath(year, {
                players,
                hidePlayed,
                sort: sortMode,
              })}
            />
          ) : (
            <>
              <Filters
                players={players}
                playerOptions={keys(data.by_player)}
                onPlayersChange={setPlayers}
                hidePlayed={hidePlayed}
                onHidePlayedChange={setHidePlayed}
                sortMode={sortMode}
                onSortModeChange={setSortMode}
                shown={games.length}
                total={keys(data.by_game).length}
                shareUrl={
                  window.location.origin +
                  sharePath(year, { players, hidePlayed, sort: sortMode })
                }
              />
              {playedError && (
                <Text c="red" size="sm" role="alert">
                  {playedError}
                </Text>
              )}
              {allPlayedError && (
                <Text c="red" size="sm" role="alert">
                  {allPlayedError}
                </Text>
              )}
              <div
                role="status"
                aria-live="polite"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocus={() => !autoFocus.current && setFocused(true)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setFocused(false);
                  }
                }}
              >
                {lastVetoed && (
                  <div className="undo-bar">
                    <span>
                      {lastVetoed.switched ? (
                        lastVetoed.scope === "all" ? (
                          "Veto changed to every year."
                        ) : (
                          `Veto changed to ${year} only.`
                        )
                      ) : (
                        <>
                          Vetoed {lastVetoed.name}
                          {lastVetoed.scope === "year" && ` for ${year}`}.
                        </>
                      )}
                    </span>
                    <div className="undo-bar__actions">
                      <Button
                        ref={undoRef}
                        size="xs"
                        disabled={
                          vetoes.isSaving(lastVetoed.id) ||
                          yearVetoes.isSaving(lastVetoed.id)
                        }
                        onClick={() => void undo(lastVetoed.id)}
                      >
                        Undo
                      </Button>
                      <Button size="xs" variant="default" onClick={dismiss}>
                        Dismiss
                      </Button>
                    </div>
                    {errorOf(lastVetoed.id) && (
                      <Text c="red" size="sm" role="alert">
                        {errorOf(lastVetoed.id)}
                      </Text>
                    )}
                  </div>
                )}
                {!lastVetoed &&
                  switchErrorId !== null &&
                  errorOf(switchErrorId) && (
                    <Text c="red" size="sm" role="alert">
                      {errorOf(switchErrorId)}
                    </Text>
                  )}
              </div>
              {games.length === 0 ? (
                <>
                  <Notice title="No games to rank">
                    {players.length > 0
                      ? hidePlayed
                        ? "No ranked games are left that include everyone you picked, fit a group of that size and haven't been played by them."
                        : "None of the ranked games include everyone you picked and fit a group of that size."
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
                <>
                  <div ref={listRef}>
                    <GamesList
                      key={`${year}|${players.join(",")}|${hidePlayed}|${sortMode}`}
                      afterPodium={splitSuggestions}
                      games={games}
                      year={year}
                      selectedMax={selectedMax}
                      individualMax={individualMax}
                      gameData={game_data}
                      isPlayed={isPlayed}
                      onToggle={handleToggle}
                      vetoes={vetoes}
                      yearVetoes={yearVetoes}
                      discordId={user.discordId}
                      onOpenVeto={setVetoingId}
                    />
                  </div>
                  {markingDialog}
                  {vetoingId !== null && year !== null && (
                    <VetoDialog
                      game={vetoingName}
                      year={year}
                      vetoed={
                        vetoes.all[user.discordId]?.has(vetoingKey) ?? false
                      }
                      yearVetoed={
                        yearVetoes.all[user.discordId]?.has(vetoingKey) ?? false
                      }
                      savingVeto={vetoes.isSaving(vetoingId)}
                      savingYear={yearVetoes.isSaving(vetoingId)}
                      onClose={() => setVetoingId(null)}
                      onVeto={(on) =>
                        pickVeto("all", vetoingId, vetoingName, on)
                      }
                      onYearVeto={(on) =>
                        pickVeto("year", vetoingId, vetoingName, on)
                      }
                      onSwitch={(to) => {
                        setVetoingId(null);
                        doSwitch(to, vetoingId, vetoingName);
                      }}
                    />
                  )}
                  <UnplayedShelf games={game_data} />
                </>
              )}
              <Button
                component={Link}
                href={topPicksPath(year)}
                variant="light"
                mt="md"
              >
                Top picks still unplayed
              </Button>
            </>
          )}
        </AppShell.Main>
      </AppShell>
    </PlayerColorProvider>
  );
}

export default Scoreboard;
