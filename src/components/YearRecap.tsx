import { useMemo, type ReactNode } from "react";
import { Link } from "wouter";

import {
  Alert,
  Badge,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import GameCover from "@/components/GameCover";
import useData from "@/hooks/useData";
import useGames from "@/hooks/useGames";
import useMemberPlayed from "@/hooks/useMemberPlayed";
import usePageMeta from "@/hooks/usePageMeta";
import useProfile from "@/hooks/useProfile";
import useYears from "@/hooks/useYears";
import { buildSelectedGames } from "@/lib/games";
import { pageMeta, recapMeta } from "@/lib/pageMeta";
import { RECAP_TOP, buildRecap } from "@/lib/recap";
import { gamePath, isYear } from "@/lib/routes";
import type { RecapFacts, RecapGame } from "@/types";

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

type GameMap = ReturnType<typeof useGames>["games"];

// A game's cover beside its label, right-aligned like the other fact values.
const FactGame = ({
  bggId,
  label,
  games,
}: {
  bggId: number;
  label: string;
  games: GameMap;
}) => (
  <Group gap="xs" wrap="nowrap" justify="flex-end">
    <GameCover image={games[String(bggId)]?.image} />
    <Text c="dimmed" miw={0} style={{ overflowWrap: "anywhere" }}>
      {label}
    </Text>
  </Group>
);

const FactGames = ({
  list,
  total,
  games,
}: {
  list: RecapGame[];
  total: number;
  games: GameMap;
}) => (
  <Stack gap={4} align="flex-end">
    {list.map((g) => (
      <FactGame key={g.bggId} bggId={g.bggId} label={g.game} games={games} />
    ))}
    {total > list.length && (
      <Text c="dimmed">and {total - list.length} more</Text>
    )}
  </Stack>
);

// One line per fact; a fact without a value is left out.
const factRows = (
  facts: RecapFacts,
  name: string,
  games: GameMap,
): [string, ReactNode][] => {
  const rows: [string, ReactNode | null][] = [
    [
      "Average games per member",
      facts.groupAvgGames === null
        ? null
        : `${Number(facts.groupAvgGames.toFixed(1))}`,
    ],
    [
      "Your #1 picks",
      facts.topPicks.total > 0 ? (
        <FactGames
          list={facts.topPicks.games}
          total={facts.topPicks.total}
          games={games}
        />
      ) : null,
    ],
    [
      "Highest rating",
      facts.highestRating ? (
        <FactGame
          bggId={facts.highestRating.bggId}
          label={`${facts.highestRating.score} for ${facts.highestRating.game}`}
          games={games}
        />
      ) : null,
    ],
    [
      "Group favourite",
      facts.groupFavourite ? (
        <FactGame
          bggId={facts.groupFavourite.bggId}
          label={`${facts.groupFavourite.game}, played by ${plural(facts.groupFavourite.members, "member")}`}
          games={games}
        />
      ) : null,
    ],
    [
      `Only ${name} played`,
      facts.onlyYou.total > 0 ? (
        <FactGames
          list={facts.onlyYou.games}
          total={facts.onlyYou.total}
          games={games}
        />
      ) : null,
    ],
    [
      facts.versusPrevious ? `Versus ${facts.versusPrevious.year}` : "",
      facts.versusPrevious
        ? `${plural(facts.versusPrevious.gamesPlayed, "game")}, ${
            facts.versusPrevious.delta === 0
              ? "no change"
              : `${facts.versusPrevious.delta > 0 ? "up" : "down"} ${Math.abs(facts.versusPrevious.delta)}`
          }`
        : null,
    ],
  ];
  return rows.filter((r): r is [string, ReactNode] => r[1] !== null);
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <Group justify="space-between" wrap="nowrap" align="flex-start">
    <Text fw={600} flex="1 1 auto" miw={0} style={{ overflowWrap: "anywhere" }}>
      {label}
    </Text>
    <Stack
      gap={0}
      align="flex-end"
      c="dimmed"
      ta="right"
      flex="1 1 auto"
      miw={0}
      style={{ overflowWrap: "anywhere" }}
    >
      {children}
    </Stack>
  </Group>
);

const Loaded = ({
  discordId,
  year,
  years,
}: {
  discordId: string;
  year: string;
  years: string[];
}) => {
  const earlierYears = years.filter((y) => y < year);
  const data = useData(year);
  const { games, loading: gamesLoading, error: gamesError } = useGames();
  const profile = useProfile(discordId);
  const played = useMemberPlayed(discordId, year, earlierYears);

  usePageMeta(
    profile.status === "not_found"
      ? pageMeta({ title: "Profile not found" })
      : profile.status === "ready"
        ? recapMeta(profile.profile.name, discordId, year)
        : pageMeta({ title: "Year in review" }),
  );

  const recap = useMemo(() => {
    if (played.status !== "ready" || data.loading || data.error) return null;
    const top = buildSelectedGames({
      byPlayer: data.by_player,
      players: [],
      gameData: games,
      hidePlayed: false,
      playerPlayed: {},
    }).slice(0, RECAP_TOP);
    const { [year]: yearPlayed, ...earlierPlayed } = played.byYear;
    return buildRecap({
      top,
      played: yearPlayed,
      earlierPlayed,
      scores: data.scores,
      discordId,
      allPlayed: played.allPlayed,
      games,
    });
  }, [played, data, games, year, discordId]);

  if (profile.status === "not_found") {
    return (
      <Alert color="gray" mt="md" title="Profile not found">
        There is no member with that profile.
      </Alert>
    );
  }
  if (
    profile.status === "error" ||
    played.status === "error" ||
    data.error ||
    gamesError
  ) {
    return (
      <Alert color="red" mt="md" title="Couldn't load this recap">
        Refresh the page to try again.
      </Alert>
    );
  }
  if (
    profile.status === "loading" ||
    played.status === "loading" ||
    data.loading ||
    gamesLoading ||
    recap === null
  ) {
    return <Loader mt="md" />;
  }
  if (data.scores.length === 0) {
    return (
      <Alert color="gray" mt="md" title={`No scores for ${year}`}>
        There is nothing to look back on for that year.
      </Alert>
    );
  }

  const { name } = profile.profile;
  const facts = factRows(recap.facts, name, games);

  return (
    <Stack mt="md">
      <Title order={2} style={{ overflowWrap: "anywhere" }}>
        {name}&apos;s {year} in review
      </Title>
      <Text c="dimmed">
        {plural(recap.playedGames, "game")} played
        {recap.newPicks !== null &&
          ` · ${plural(recap.newPicks.length, "new pick")}`}
      </Text>

      {facts.length > 0 && (
        <Paper withBorder p="sm">
          <Title order={4} mb="xs">
            Fun facts
          </Title>
          <Stack gap="xs">
            {facts.map(([label, value]) => (
              <Row key={label} label={label}>
                {value}
              </Row>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper withBorder p="sm">
        <Title order={4} mb="xs" style={{ overflowWrap: "anywhere" }}>
          In the {year} top {RECAP_TOP}, not played by {name}
        </Title>
        {recap.unplayedTop.length === 0 ? (
          <Text c="dimmed" style={{ overflowWrap: "anywhere" }}>
            {name} played every game in the top.
          </Text>
        ) : (
          <Stack gap="xs">
            {recap.unplayedTop.map((g) => (
              <Group key={g.bggId} justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <Badge variant="light" aria-label={`place ${g.rank}`}>
                    {g.rank}
                  </Badge>
                  <GameCover
                    image={games[String(g.bggId)]?.image}
                    cover={games[String(g.bggId)]?.cover}
                  />
                  <Link href={gamePath(year, g.bggId)}>{g.game}</Link>
                </Group>
                <Text c="dimmed">not played</Text>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper withBorder p="sm">
        <Title order={4} mb="xs">
          New picks
        </Title>
        {recap.newPicks === null ? (
          <Text c="dimmed">No earlier years to compare with.</Text>
        ) : recap.newPicks.length === 0 ? (
          <Text c="dimmed">No games were played for the first time.</Text>
        ) : (
          <Stack gap="xs">
            {recap.newPicks.map((g) => (
              <Group key={g.bggId} justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <GameCover
                    image={games[String(g.bggId)]?.image}
                    cover={games[String(g.bggId)]?.cover}
                  />
                  <Link href={gamePath(year, g.bggId)}>{g.game}</Link>
                </Group>
                <Text c="dimmed">first played {year}</Text>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
};

// A member's recap of one year. The year must be one the app has scores for;
// anything else is a not-found page and fetches nothing.
const YearRecap = ({
  discordId,
  year,
}: {
  discordId: string;
  year: string;
}) => {
  const { years, loading, error } = useYears();

  if (loading) return <Loader mt="md" />;
  if (error) {
    return (
      <Alert color="red" mt="md" title="Couldn't load this recap">
        Refresh the page to try again.
      </Alert>
    );
  }
  if (!isYear(year) || !years.includes(year)) {
    return (
      <Alert color="gray" mt="md" title="Year not found">
        There are no scores for that year.
      </Alert>
    );
  }
  return <Loaded discordId={discordId} year={year} years={years} />;
};

export default YearRecap;
