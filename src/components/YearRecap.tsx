import { useMemo } from "react";
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

import useData from "@/hooks/useData";
import useGames from "@/hooks/useGames";
import useMemberPlayed from "@/hooks/useMemberPlayed";
import useProfile from "@/hooks/useProfile";
import useYears from "@/hooks/useYears";
import { buildSelectedGames } from "@/lib/games";
import images from "@/lib/images";
import { RECAP_TOP, buildRecap } from "@/lib/recap";
import { gamePath, isYear } from "@/lib/routes";
import type { RecapFacts, RecapGame } from "@/types";

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const names = (games: RecapGame[], total: number) =>
  games.map((g) => g.game).join(", ") +
  (total > games.length ? ` and ${total - games.length} more` : "");

// One line per fact; a fact without a value is left out.
const factRows = (facts: RecapFacts, name: string): [string, string][] => {
  const rows: [string, string | null][] = [
    [
      "Total plays",
      facts.totalPlays === 0 && facts.groupAvgPlays === null
        ? null
        : `${facts.totalPlays}` +
          (facts.groupAvgPlays === null
            ? ""
            : `, group average ${Number(facts.groupAvgPlays.toFixed(1))}`),
    ],
    [
      "Most played",
      facts.mostPlayed
        ? `${facts.mostPlayed.game}, ${plural(facts.mostPlayed.plays, "play")}`
        : null,
    ],
    [
      "Your #1 picks",
      facts.topPicks.total > 0
        ? `${facts.topPicks.total} (${names(facts.topPicks.games, facts.topPicks.total)})`
        : null,
    ],
    [
      "Highest rating",
      facts.highestRating
        ? `${facts.highestRating.score} for ${facts.highestRating.game}`
        : null,
    ],
    [
      "Group favourite",
      facts.groupFavourite
        ? `${facts.groupFavourite.game}, ${plural(facts.groupFavourite.plays, "play")} (${name}: ${facts.groupFavourite.memberPlays})`
        : null,
    ],
    [
      `Only ${name} played`,
      facts.onlyYou.total > 0
        ? names(facts.onlyYou.games, facts.onlyYou.total)
        : null,
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
  return rows.filter((r): r is [string, string] => r[1] !== null);
};

const Row = ({ label, children }: { label: string; children: string }) => (
  <Group justify="space-between" wrap="nowrap" align="flex-start">
    <Text fw={600}>{label}</Text>
    <Text c="dimmed" ta="right">
      {children}
    </Text>
  </Group>
);

const Loaded = ({ discordId, year }: { discordId: string; year: string }) => {
  const { years } = useYears();
  const earlierYears = years.filter((y) => y < year);
  const data = useData(year);
  const { games, loading: gamesLoading, error: gamesError } = useGames();
  const profile = useProfile(discordId);
  const played = useMemberPlayed(discordId, year, earlierYears);

  const recap = useMemo(() => {
    if (played.status !== "ready" || data.loading || data.error) return null;
    const top = buildSelectedGames({
      byPlayer: data.by_player,
      players: [],
      gameData: games,
      images,
      hidePlayed: false,
      playerCounts: {},
    }).slice(0, RECAP_TOP);
    const { [year]: counts, ...earlierCounts } = played.byYear;
    return buildRecap({
      top,
      counts,
      earlierCounts,
      scores: data.scores,
      discordId,
      allCounts: played.allCounts,
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
  const facts = factRows(recap.facts, name);

  return (
    <Stack mt="md">
      <Title order={2}>
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
        <Title order={4} mb="xs">
          In the {year} top {RECAP_TOP}, not played by {name}
        </Title>
        {recap.unplayedTop.length === 0 ? (
          <Text c="dimmed">{name} played every game in the top.</Text>
        ) : (
          <Stack gap="xs">
            {recap.unplayedTop.map((g) => (
              <Group key={g.bggId} justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <Badge variant="light" aria-label={`place ${g.rank}`}>
                    {g.rank}
                  </Badge>
                  <Link href={gamePath(year, g.bggId)}>{g.game}</Link>
                </Group>
                <Text c="dimmed">0 plays</Text>
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
                <Link href={gamePath(year, g.bggId)}>{g.game}</Link>
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
  return <Loaded discordId={discordId} year={year} />;
};

export default YearRecap;
