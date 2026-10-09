import { Link } from "wouter";

import { Badge, Group, Paper, Stack, Text, Title } from "@mantine/core";

import type { YearTopGames } from "@/types";

const MEDALS: Record<number, string> = {
  1: "yellow",
  2: "gray",
  3: "orange",
};

const TopGamesByYear = ({ topByYear }: { topByYear: YearTopGames[] }) => {
  if (topByYear.length === 0) return null;

  return (
    <Stack>
      <Title order={4}>Top games by year</Title>
      {topByYear.map(({ year, total, games }) => (
        <Paper key={year} withBorder p="sm">
          <Group justify="space-between" mb="xs">
            <Title order={5}>{year}</Title>
            <Text size="sm" c="dimmed">
              {total > games.length
                ? `${games.length} of ${total} games`
                : `${total} games`}
            </Text>
          </Group>
          <Stack gap="xs">
            {games.map((g) => (
              <Group key={g.bggId} justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <Badge
                    color={MEDALS[g.rank] ?? "gray"}
                    variant={MEDALS[g.rank] ? "filled" : "light"}
                    aria-label={`place ${g.rank}`}
                  >
                    {g.rank}
                  </Badge>
                  <Link href={`/games/${g.bggId}`}>{g.game}</Link>
                </Group>
                <Text>{g.score}</Text>
              </Group>
            ))}
          </Stack>
          {total > games.length && (
            <Text size="sm" c="dimmed" mt="xs">
              +{total - games.length} more not shown
            </Text>
          )}
        </Paper>
      ))}
    </Stack>
  );
};

export default TopGamesByYear;
