import { Link } from "wouter";

import { Group, Paper, Stack, Text, Title } from "@mantine/core";

import { gamePath } from "@/lib/routes";
import { returningFavorites, risingGames } from "@/lib/yearTrends";
import type { YearTotal } from "@/types";

interface YearTrendsProps {
  totals: YearTotal[];
  year: number;
  // Game names by bgg id; games without a name this year are skipped.
  names: Record<string, string>;
}

interface Row {
  bggId: number;
  detail: string;
}

const Panel = ({
  title,
  rows,
  year,
  names,
}: {
  title: string;
  rows: Row[];
  year: number;
  names: Record<string, string>;
}) => {
  const named = rows.filter((r) => names[r.bggId]);
  if (named.length === 0) return null;
  return (
    <Paper withBorder p="sm" style={{ flex: 1, minWidth: 260 }}>
      <Title order={5} mb="xs">
        {title}
      </Title>
      <Stack gap="xs">
        {named.map((r) => (
          <Group key={r.bggId} justify="space-between" wrap="nowrap">
            <Link href={gamePath(year, r.bggId)}>{names[r.bggId]}</Link>
            <Text size="sm" c="dimmed">
              {r.detail}
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
};

const YearTrends = ({ totals, year, names }: YearTrendsProps) => {
  const returning = returningFavorites(totals, year).map((r) => ({
    bggId: r.bggId,
    detail: `${r.peak} in ${r.peakYear}`,
  }));
  const rising = risingGames(totals, year).map((r) => ({
    bggId: r.bggId,
    detail: `+${r.delta} (${r.previous} to ${r.total})`,
  }));
  if (returning.length === 0 && rising.length === 0) return null;

  return (
    <Group align="stretch" mt="md">
      <Panel
        title="Returning favorites"
        rows={returning}
        year={year}
        names={names}
      />
      <Panel title="Rising games" rows={rising} year={year} names={names} />
    </Group>
  );
};

export default YearTrends;
